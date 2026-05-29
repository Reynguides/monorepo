using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Demo;
using Reyn.Infrastructure.Persistence;
using Xunit;

namespace Reyn.Application.Tests.Demo;

public sealed class DemoDataSeederTests : IAsyncDisposable
{
    private readonly SqliteConnection _conn;
    private readonly DbContextOptions<ReynDbContext> _options;

    public DemoDataSeederTests()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _options = new DbContextOptionsBuilder<ReynDbContext>().UseSqlite(_conn).Options;
        using var db = new ReynDbContext(_options);
        db.Database.Migrate();
    }

    public async ValueTask DisposeAsync()
    {
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task SeedAsync_populates_events_sessions_and_achievements()
    {
        await using var db = new ReynDbContext(_options);
        var seeder = new DemoDataSeeder(db, new StaticCurrentUserAccessor());
        var inserted = await seeder.SeedAsync(CancellationToken.None);

        inserted.Should().BeGreaterThan(0);
        (await db.GameEvents.CountAsync()).Should().BeGreaterThan(0);
        (await db.PlaySessions.CountAsync()).Should().Be(6);
        (await db.Achievements.CountAsync()).Should().Be(10);
        (await db.Achievements.CountAsync(a => a.Unlocked)).Should().Be(4);
    }

    [Fact]
    public async Task SeedAsync_is_idempotent_when_DB_already_has_events()
    {
        await using var db = new ReynDbContext(_options);
        var seeder = new DemoDataSeeder(db, new StaticCurrentUserAccessor());
        var first = await seeder.SeedAsync(CancellationToken.None);
        first.Should().BeGreaterThan(0);

        await using var db2 = new ReynDbContext(_options);
        var seeder2 = new DemoDataSeeder(db2, new StaticCurrentUserAccessor());
        var second = await seeder2.SeedAsync(CancellationToken.None);
        second.Should().Be(0);
    }

    [Fact]
    public async Task SeedAsync_produces_at_least_one_character_level_up_event()
    {
        await using var db = new ReynDbContext(_options);
        var seeder = new DemoDataSeeder(db, new StaticCurrentUserAccessor());
        await seeder.SeedAsync(CancellationToken.None);

        (await db.GameEvents.CountAsync(e => e.Type == "bg3.character.level_up"))
            .Should().BeGreaterThan(0);
    }
}
