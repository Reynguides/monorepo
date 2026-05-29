using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Reyn.Application.Sync;
using Reyn.Domain;
using Reyn.Infrastructure.Persistence;

namespace Reyn.Infrastructure.Sync;

/// <summary>
/// Background loop that drains <see cref="ReynDbContext.SyncOutbox"/> by
/// pushing batches to the Worker. Each cycle:
///
///   1. Read up to <c>BatchSize</c> Pending entries whose NextAttemptAt is
///      due (or null), oldest first.
///   2. Hydrate the corresponding <see cref="GameEvent"/> rows.
///   3. POST to <c>/v1/sync/push</c> with an Idempotency-Key derived from
///      the batch's first event id (replay-stable across retries).
///   4. On success → mark Synced.
///   5. On <see cref="SyncTransientException"/> or
///      <see cref="SyncAuthException"/> → increment Attempts, set
///      NextAttemptAt = now + jittered backoff, keep Pending. Past
///      <see cref="BackoffPolicy.MaxAttempts"/> attempts, transition to
///      DeadLettered.
///   6. On <see cref="SyncPermanentException"/> → DeadLettered immediately.
///
/// Per-cycle publishes a fresh <see cref="SyncSnapshot"/> so the UI sees
/// queue depth + last error in near-real-time.
/// </summary>
public sealed partial class OutboxProcessor : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IEventSyncClient _sync;
    private readonly ISyncStatusWriter _statusWriter;
    private readonly ISyncStatusPublisher _statusReader;
    private readonly ILogger<OutboxProcessor> _log;
    private readonly SyncOptions _options;
    private readonly Random _rand;

    public OutboxProcessor(
        IServiceScopeFactory scopes,
        IEventSyncClient sync,
        ISyncStatusWriter statusWriter,
        ISyncStatusPublisher statusReader,
        ILogger<OutboxProcessor> log,
        IOptions<SyncOptions> options,
        Random? rand = null)
    {
        _scopes = scopes;
        _sync = sync;
        _statusWriter = statusWriter;
        _statusReader = statusReader;
        _log = log;
        _options = options.Value;
        _rand = rand ?? Random.Shared;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Log.CycleFailed(_log, ex);
            }
            await Task.Delay(_options.IdlePollInterval, stoppingToken).ConfigureAwait(false);
        }
    }

    internal async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();

        var now = DateTime.UtcNow;
        var due = await db.SyncOutbox
            .Where(e => e.Status == Domain.SyncStatus.Pending
                && (e.NextAttemptAt == null || e.NextAttemptAt <= now))
            .OrderBy(e => e.CreatedAt)
            .Take(_options.BatchSize)
            .ToListAsync(ct).ConfigureAwait(false);

        if (due.Count == 0)
        {
            await PublishSnapshotAsync(db, null, null, ct).ConfigureAwait(false);
            return;
        }

        var eventIds = due.Select(d => d.EventId).ToHashSet();
        var events = await db.GameEvents
            .Where(g => eventIds.Contains(g.EventId))
            .ToListAsync(ct).ConfigureAwait(false);

        var payload = events.Select(g => new EventPayload(
            g.EventId,
            g.Type,
            new DateTimeOffset(DateTime.SpecifyKind(g.OccurredAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
            g.PayloadJson)).ToList();

        var idempotencyKey = string.Format(
            CultureInfo.InvariantCulture,
            "outbox-{0:N}-{1}",
            due[0].EventId,
            due.Count);

        try
        {
            await _sync.PushAsync(payload, idempotencyKey, ct).ConfigureAwait(false);
            foreach (var entry in due)
            {
                entry.Status = Domain.SyncStatus.Synced;
                entry.NextAttemptAt = null;
                entry.LastError = null;
            }
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            await PublishSnapshotAsync(db, DateTime.UtcNow, null, ct).ConfigureAwait(false);
        }
        catch (SyncPermanentException ex)
        {
            await DeadLetterAsync(db, due, ex.Message, ct).ConfigureAwait(false);
        }
        catch (SyncException ex)
        {
            await ScheduleRetryOrDeadLetterAsync(db, due, ex, ct).ConfigureAwait(false);
        }
    }

    private async Task DeadLetterAsync(
        ReynDbContext db,
        IReadOnlyList<SyncOutboxEntry> due,
        string error,
        CancellationToken ct)
    {
        foreach (var entry in due)
        {
            entry.Status = Domain.SyncStatus.DeadLettered;
            entry.LastError = error;
            entry.NextAttemptAt = null;
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        await PublishSnapshotAsync(db, null, error, ct).ConfigureAwait(false);
    }

    private async Task ScheduleRetryOrDeadLetterAsync(
        ReynDbContext db,
        IReadOnlyList<SyncOutboxEntry> due,
        SyncException ex,
        CancellationToken ct)
    {
        foreach (var entry in due)
        {
            entry.Attempts++;
            entry.LastError = ex.Message;
            if (BackoffPolicy.ShouldDeadLetter(entry.Attempts))
            {
                entry.Status = Domain.SyncStatus.DeadLettered;
                entry.NextAttemptAt = null;
            }
            else
            {
                entry.NextAttemptAt = DateTime.UtcNow + BackoffPolicy.NextDelay(entry.Attempts, _rand);
            }
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        await PublishSnapshotAsync(db, null, ex.Message, ct).ConfigureAwait(false);
    }

    private async Task PublishSnapshotAsync(
        ReynDbContext db,
        DateTime? lastSuccess,
        string? lastError,
        CancellationToken ct)
    {
        var pending = await db.SyncOutbox.CountAsync(e => e.Status == Domain.SyncStatus.Pending, ct).ConfigureAwait(false);
        var dead = await db.SyncOutbox.CountAsync(e => e.Status == Domain.SyncStatus.DeadLettered, ct).ConfigureAwait(false);
        var snapshot = new SyncSnapshot(pending, dead, lastSuccess ?? _statusReader.Current.LastSuccessfulSyncAt, lastError);
        _statusWriter.Publish(snapshot);
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Error, Message = "Outbox cycle threw")]
        public static partial void CycleFailed(ILogger logger, Exception ex);
    }
}
