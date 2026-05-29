using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Reyn.Application.Abstractions;
using Reyn.Application.Sync;
using Reyn.Domain;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Sync;
using Xunit;

namespace Reyn.Application.Tests.Sync;

public sealed class OutboxProcessorTests : IAsyncDisposable
{
    private readonly SqliteConnection _conn;
    private readonly ServiceProvider _services;
    private readonly StubSyncClient _client;
    private readonly EventSyncStatusPublisher _publisher;

    public OutboxProcessorTests()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _client = new StubSyncClient();
        _publisher = new EventSyncStatusPublisher();

        var col = new ServiceCollection();
        col.AddDbContext<ReynDbContext>(o =>
            o.UseSqlite(_conn)
             .AddInterceptors(new OutboxEnqueuingInterceptor()));
        col.AddSingleton<ICurrentUserAccessor>(new StaticCurrentUserAccessor());
        _services = col.BuildServiceProvider();

        using var scope = _services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ReynDbContext>().Database.Migrate();
    }

    private OutboxProcessor BuildProcessor(int batch = 100, Random? rand = null) => new(
        _services.GetRequiredService<IServiceScopeFactory>(),
        _client,
        _publisher,
        _publisher,
        NullLogger<OutboxProcessor>.Instance,
        Options.Create(new SyncOptions { BatchSize = batch }),
        rand ?? new Random(0));

    private async Task SeedEventAsync(string contentHash = "h")
    {
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        db.GameEvents.Add(new GameEvent
        {
            EventId = Guid.NewGuid(),
            UserId = "u1",
            Type = "t",
            OccurredAt = DateTime.UtcNow,
            PayloadJson = "{}",
            ContentHash = contentHash,
            ReceivedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _services.DisposeAsync();
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task Idle_cycle_publishes_empty_snapshot()
    {
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);
        _publisher.Current.PendingCount.Should().Be(0);
        _publisher.Current.DeadLetteredCount.Should().Be(0);
        _client.PushCalls.Should().Be(0);
    }

    [Fact]
    public async Task Successful_cycle_marks_entries_Synced()
    {
        await SeedEventAsync();
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);
        _client.PushCalls.Should().Be(1);
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        (await db.SyncOutbox.SingleAsync()).Status.Should().Be(SyncStatus.Synced);
        _publisher.Current.PendingCount.Should().Be(0);
        _publisher.Current.LastSuccessfulSyncAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Transient_failure_schedules_retry_and_increments_attempts()
    {
        await SeedEventAsync();
        _client.NextThrow = new SyncTransientException("flaky");
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);

        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.Status.Should().Be(SyncStatus.Pending);
        entry.Attempts.Should().Be(1);
        entry.NextAttemptAt.Should().NotBeNull();
        entry.LastError.Should().Be("flaky");
        _publisher.Current.LastError.Should().Be("flaky");
    }

    [Fact]
    public async Task Auth_failure_is_treated_as_transient_retry()
    {
        await SeedEventAsync();
        _client.NextThrow = new SyncAuthException("no token");
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);

        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.Status.Should().Be(SyncStatus.Pending);
        entry.Attempts.Should().Be(1);
    }

    [Fact]
    public async Task Permanent_failure_dead_letters_immediately()
    {
        await SeedEventAsync();
        _client.NextThrow = new SyncPermanentException("bad payload");
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);

        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.Status.Should().Be(SyncStatus.DeadLettered);
        entry.NextAttemptAt.Should().BeNull();
        entry.LastError.Should().Be("bad payload");
        _publisher.Current.DeadLetteredCount.Should().Be(1);
    }

    [Fact]
    public async Task Transient_failure_dead_letters_after_max_attempts()
    {
        await SeedEventAsync();
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.Attempts = BackoffPolicy.MaxAttempts - 1;
        await db.SaveChangesAsync();

        _client.NextThrow = new SyncTransientException("still flaky");
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);

        await using var verifyScope = _services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var final = await verifyDb.SyncOutbox.SingleAsync();
        final.Status.Should().Be(SyncStatus.DeadLettered);
        final.Attempts.Should().Be(BackoffPolicy.MaxAttempts);
    }

    [Fact]
    public async Task NextAttemptAt_in_future_blocks_entry_from_pickup()
    {
        await SeedEventAsync();
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.NextAttemptAt = DateTime.UtcNow.AddHours(1);
        await db.SaveChangesAsync();

        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);
        _client.PushCalls.Should().Be(0);
    }

    [Fact]
    public async Task Snapshot_preserves_last_success_after_failure_cycle()
    {
        await SeedEventAsync();
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);
        var firstSuccess = _publisher.Current.LastSuccessfulSyncAt;
        firstSuccess.Should().NotBeNull();

        await SeedEventAsync(contentHash: "h2");
        _client.NextThrow = new SyncTransientException("flake");
        await proc.RunCycleAsync(CancellationToken.None);
        _publisher.Current.LastSuccessfulSyncAt.Should().Be(firstSuccess);
        _publisher.Current.LastError.Should().Be("flake");
    }

    [Fact]
    public async Task ExecuteAsync_drains_outbox_until_cancellation()
    {
        await SeedEventAsync();
        var proc = new OutboxProcessor(
            _services.GetRequiredService<IServiceScopeFactory>(),
            _client,
            _publisher,
            _publisher,
            NullLogger<OutboxProcessor>.Instance,
            Options.Create(new SyncOptions { IdlePollInterval = TimeSpan.FromMilliseconds(20) }),
            new Random(0));

        using var cts = new CancellationTokenSource();
        await proc.StartAsync(cts.Token);
        await Task.Delay(150);
        cts.Cancel();
        await proc.StopAsync(CancellationToken.None);

        _client.PushCalls.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task ExecuteAsync_logs_and_continues_on_unexpected_exceptions()
    {
        await SeedEventAsync();
        _client.NextThrow = new InvalidOperationException("unexpected");
        var proc = new OutboxProcessor(
            _services.GetRequiredService<IServiceScopeFactory>(),
            _client,
            _publisher,
            _publisher,
            NullLogger<OutboxProcessor>.Instance,
            Options.Create(new SyncOptions { IdlePollInterval = TimeSpan.FromMilliseconds(20) }),
            new Random(0));

        using var cts = new CancellationTokenSource();
        await proc.StartAsync(cts.Token);
        await Task.Delay(80);
        cts.Cancel();
        await proc.StopAsync(CancellationToken.None);
        _client.PushCalls.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Idempotency_key_is_stable_across_retries_of_the_same_batch()
    {
        await SeedEventAsync();
        _client.NextThrow = new SyncTransientException("flaky once");
        var proc = BuildProcessor();
        await proc.RunCycleAsync(CancellationToken.None);
        _client.NextThrow = null;

        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        var entry = await db.SyncOutbox.SingleAsync();
        entry.NextAttemptAt = null;
        await db.SaveChangesAsync();

        await proc.RunCycleAsync(CancellationToken.None);

        _client.IdempotencyKeys.Distinct().Should().ContainSingle(
            "the same batch must reuse its key across retries so the server can dedup");
    }

    private sealed class StubSyncClient : IEventSyncClient
    {
        public int PushCalls;
        public Exception? NextThrow;
        public readonly List<string> IdempotencyKeys = new();

        public Task<PushResult> PushAsync(
            IReadOnlyList<EventPayload> events,
            string idempotencyKey,
            CancellationToken ct)
        {
            PushCalls++;
            IdempotencyKeys.Add(idempotencyKey);
            if (NextThrow is { } ex)
            {
                throw ex;
            }
            return Task.FromResult(new PushResult(events.Count, 0));
        }

        public Task<PullPage> PullAsync(long? sinceCursor, int limit, CancellationToken ct) =>
            Task.FromResult(new PullPage(Array.Empty<PullItem>(), null));
    }
}
