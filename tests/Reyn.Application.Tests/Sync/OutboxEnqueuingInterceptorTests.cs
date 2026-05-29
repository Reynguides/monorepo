using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Reyn.Domain;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Sync;
using Xunit;

namespace Reyn.Application.Tests.Sync;

public sealed class OutboxEnqueuingInterceptorTests
{
    private static async Task<(SqliteConnection conn, ReynDbContext db)> CreateAsync()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        await conn.OpenAsync();
        var opts = new DbContextOptionsBuilder<ReynDbContext>()
            .UseSqlite(conn)
            .AddInterceptors(new OutboxEnqueuingInterceptor())
            .Options;
        var db = new ReynDbContext(opts);
        await db.Database.MigrateAsync();
        return (conn, db);
    }

    [Fact]
    public async Task Adding_a_GameEvent_enqueues_a_Pending_outbox_row()
    {
        var (conn, db) = await CreateAsync();
        await using (conn)
        await using (db)
        {
            var ev = new GameEvent
            {
                EventId = Guid.NewGuid(),
                UserId = "u1",
                Type = "bg3.test",
                OccurredAt = DateTime.UtcNow,
                PayloadJson = "{}",
                ContentHash = "h",
                ReceivedAt = DateTime.UtcNow,
            };
            db.GameEvents.Add(ev);
            await db.SaveChangesAsync();

            var outbox = await db.SyncOutbox.SingleAsync();
            outbox.EventId.Should().Be(ev.EventId);
            outbox.Status.Should().Be(SyncStatus.Pending);
            outbox.PayloadHash.Should().Be("h");
            outbox.Attempts.Should().Be(0);
        }
    }

    [Fact]
    public async Task Computes_hash_when_GameEvent_ContentHash_is_blank()
    {
        var (conn, db) = await CreateAsync();
        await using (conn)
        await using (db)
        {
            var ev = new GameEvent
            {
                EventId = Guid.NewGuid(),
                UserId = "u1",
                Type = "bg3.test",
                OccurredAt = DateTime.UtcNow,
                PayloadJson = """{"x":1}""",
                ContentHash = "",
                ReceivedAt = DateTime.UtcNow,
            };
            db.GameEvents.Add(ev);
            await db.SaveChangesAsync();

            var outbox = await db.SyncOutbox.SingleAsync();
            outbox.PayloadHash.Should().MatchRegex("^[0-9a-f]{64}$");
        }
    }

    [Fact]
    public async Task Does_not_duplicate_outbox_row_when_already_explicitly_added()
    {
        var (conn, db) = await CreateAsync();
        await using (conn)
        await using (db)
        {
            var id = Guid.NewGuid();
            db.GameEvents.Add(new GameEvent
            {
                EventId = id,
                UserId = "u1",
                Type = "t",
                OccurredAt = DateTime.UtcNow,
                PayloadJson = "{}",
                ContentHash = "h",
                ReceivedAt = DateTime.UtcNow,
            });
            db.SyncOutbox.Add(new SyncOutboxEntry
            {
                EventId = id,
                PayloadHash = "h",
                Status = SyncStatus.Pending,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();

            (await db.SyncOutbox.CountAsync()).Should().Be(1);
        }
    }

    [Fact]
    public async Task Ignores_saves_with_no_GameEvent_additions()
    {
        var (conn, db) = await CreateAsync();
        await using (conn)
        await using (db)
        {
            db.UserAccounts.Add(new UserAccount
            {
                Id = Guid.NewGuid(),
                Email = "x@example.com",
                PasswordHash = "hh",
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
            (await db.SyncOutbox.CountAsync()).Should().Be(0);
        }
    }

    [Fact]
    public void Interceptor_no_ops_when_context_is_not_ReynDbContext()
    {
        var interceptor = new OutboxEnqueuingInterceptor();
        // Indirect: synthesize a non-Reyn DbContext, run SavingChanges via
        // the EF pipeline. The interceptor's gate is a type check; an
        // unrelated DbContext leaves it alone. We exercise this by passing a
        // null Context to the helper through a vanilla DbContext run.
        using var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        var opts = new DbContextOptionsBuilder<EmptyDbContext>()
            .UseSqlite(conn)
            .AddInterceptors(interceptor)
            .Options;
        using var db = new EmptyDbContext(opts);
        db.Database.EnsureCreated();
        db.Things.Add(new Thing { Id = 1 });
        var saved = db.SaveChanges();
        saved.Should().Be(1);
    }

    private sealed class EmptyDbContext(DbContextOptions<EmptyDbContext> options) : DbContext(options)
    {
        public DbSet<Thing> Things => Set<Thing>();
    }

    private sealed class Thing
    {
        public int Id { get; set; }
    }
}
