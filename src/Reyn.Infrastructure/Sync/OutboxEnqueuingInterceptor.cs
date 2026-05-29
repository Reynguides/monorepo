using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Reyn.Domain;
using Reyn.Infrastructure.Persistence;

namespace Reyn.Infrastructure.Sync;

/// <summary>
/// EF SaveChanges interceptor: whenever a <see cref="GameEvent"/> is added,
/// piggyback a Pending <see cref="SyncOutboxEntry"/> on the same SaveChanges
/// so the outbox row is committed atomically with the event itself. Without
/// this, a crash between the event-insert and a separate outbox-insert would
/// drop the row from the sync pipeline.
///
/// The interceptor is registered via <c>DbContextOptions.AddInterceptors</c>;
/// it's a stateless singleton.
/// </summary>
public sealed class OutboxEnqueuingInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        EnqueueOutboxForNewEvents(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        EnqueueOutboxForNewEvents(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static void EnqueueOutboxForNewEvents(DbContext? context)
    {
        if (context is not ReynDbContext db)
        {
            return;
        }

        var addedEvents = db.ChangeTracker.Entries<GameEvent>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity)
            .ToList();
        if (addedEvents.Count == 0)
        {
            return;
        }

        var existingOutboxIds = db.ChangeTracker.Entries<SyncOutboxEntry>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity.EventId)
            .ToHashSet();

        var now = DateTime.UtcNow;
        foreach (var ev in addedEvents)
        {
            // Stamp the event's own ContentHash if it's empty. The events
            // table has UNIQUE(UserId, ContentHash); without this, multiple
            // inserted events with blank hashes collide on the index. The
            // outbox entry's PayloadHash mirrors the event's hash.
            if (ev.ContentHash.Length == 0)
            {
                ev.ContentHash = ComputeHash(ev);
            }
            if (existingOutboxIds.Contains(ev.EventId))
            {
                continue;
            }
            db.SyncOutbox.Add(new SyncOutboxEntry
            {
                EventId = ev.EventId,
                PayloadHash = ev.ContentHash,
                Status = Domain.SyncStatus.Pending,
                CreatedAt = now,
                Attempts = 0,
            });
        }
    }

    private static string ComputeHash(GameEvent ev)
    {
        var canonical = string.Join('\n',
            ev.UserId,
            ev.Type,
            ev.OccurredAt.ToString("o", CultureInfo.InvariantCulture),
            ev.PayloadJson);
        var bytes = Encoding.UTF8.GetBytes(canonical);
        var digest = SHA256.HashData(bytes);
        var sb = new StringBuilder(digest.Length * 2);
        foreach (var b in digest)
        {
            sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
        }
        return sb.ToString();
    }
}
