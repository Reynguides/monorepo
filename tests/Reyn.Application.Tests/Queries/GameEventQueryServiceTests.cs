using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Reyn.Application.Queries;
using Reyn.Domain;
using Reyn.Domain.Identifiers;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Queries;
using Xunit;

namespace Reyn.Application.Tests.Queries;

/// <summary>
/// Tests run against an in-memory SQLite database. Each test creates its
/// own connection so the data lives only for the test lifetime.
/// </summary>
public sealed class GameEventQueryServiceTests : IAsyncDisposable
{
    // Matches StaticCurrentUserAccessor.UserId (the Phase 2 placeholder).
    private const string TestUserId = "user1";

    private readonly SqliteConnection _conn;
    private readonly DbContextOptions<ReynDbContext> _options;
    private readonly StubDbContextFactory _factory;
    private readonly GameEventQueryService _service;

    public GameEventQueryServiceTests()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _options = new DbContextOptionsBuilder<ReynDbContext>()
            .UseSqlite(_conn)
            .Options;
        using (var db = new ReynDbContext(_options))
        {
            db.Database.Migrate();
        }
        _factory = new StubDbContextFactory(_options);
        _service = new GameEventQueryService(_factory, new StaticCurrentUserAccessor());
    }

    public async ValueTask DisposeAsync()
    {
        await _conn.DisposeAsync();
    }

    private async Task SeedAsync(Action<ReynDbContext> mutate)
    {
        await using var db = new ReynDbContext(_options);
        mutate(db);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task GetEventsPerDayAsync_returns_empty_when_user_has_no_events()
    {
        var rows = await _service.GetEventsPerDayAsync(30, CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetEventsPerDayAsync_buckets_events_by_UTC_day_for_current_user()
    {
        var today = DateTime.UtcNow.Date;
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", today),
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", today.AddHours(8)),
                MakeEvent(TestUserId, "bg3.region.entered", today.AddDays(-1)),
                MakeEvent("other-user", "bg3.combat.enemy_killed", today)); // excluded
        });
        var rows = await _service.GetEventsPerDayAsync(7, CancellationToken.None);
        rows.Should().HaveCount(2);
        rows.Single(r => r.Day == DateOnly.FromDateTime(today)).Count.Should().Be(2);
    }

    [Fact]
    public async Task GetPlaytimePerDayAsync_sums_session_durations()
    {
        var today = DateTime.UtcNow.Date;
        await SeedAsync(db =>
        {
            db.PlaySessions.AddRange(
                new PlaySession
                {
                    Id = UuidV7.NewGuid(),
                    UserId = TestUserId,
                    StartedAt = today.AddHours(18),
                    EndedAt = today.AddHours(19),
                    EventCount = 0,
                },
                new PlaySession
                {
                    Id = UuidV7.NewGuid(),
                    UserId = TestUserId,
                    StartedAt = today.AddHours(20),
                    EndedAt = today.AddHours(20).AddMinutes(45),
                    EventCount = 0,
                });
        });
        var rows = await _service.GetPlaytimePerDayAsync(7, CancellationToken.None);
        rows.Should().ContainSingle();
        rows.Single().Minutes.Should().BeApproximately(60 + 45, 0.5);
    }

    [Fact]
    public async Task GetPlaytimePerDayAsync_excludes_unended_sessions()
    {
        await SeedAsync(db =>
        {
            db.PlaySessions.Add(new PlaySession
            {
                Id = UuidV7.NewGuid(),
                UserId = TestUserId,
                StartedAt = DateTime.UtcNow.Date,
                EndedAt = null,
                EventCount = 0,
            });
        });
        var rows = await _service.GetPlaytimePerDayAsync(7, CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCharacterLevelProgressionAsync_reads_level_field_from_payload()
    {
        var today = DateTime.UtcNow.Date;
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.character.level_up", today.AddDays(-2), """{"level":2}"""),
                MakeEvent(TestUserId, "bg3.character.level_up", today.AddDays(-1), """{"level":3}"""),
                MakeEvent(TestUserId, "bg3.character.level_up", today, """{"level":4}"""));
        });
        var rows = await _service.GetCharacterLevelProgressionAsync(CancellationToken.None);
        rows.Should().HaveCount(3);
        rows[^1].Level.Should().Be(4);
    }

    [Fact]
    public async Task GetCharacterLevelProgressionAsync_skips_malformed_payloads()
    {
        await SeedAsync(db =>
        {
            db.GameEvents.Add(MakeEvent(TestUserId, "bg3.character.level_up", DateTime.UtcNow, "{}"));
        });
        var rows = await _service.GetCharacterLevelProgressionAsync(CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTimelineAsync_returns_newest_sessions_with_their_events()
    {
        var now = DateTime.UtcNow;
        await SeedAsync(db =>
        {
            var oldId = UuidV7.NewGuid();
            var newId = UuidV7.NewGuid();
            db.PlaySessions.AddRange(
                new PlaySession { Id = oldId, UserId = TestUserId, StartedAt = now.AddDays(-2), EndedAt = now.AddDays(-2).AddHours(1), EventCount = 1 },
                new PlaySession { Id = newId, UserId = TestUserId, StartedAt = now.AddHours(-1), EndedAt = now, EventCount = 1 });
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.region.entered", now.AddDays(-2).AddMinutes(10)),
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", now.AddMinutes(-30)));
        });
        var rows = await _service.GetTimelineAsync(10, 50, CancellationToken.None);
        rows.Should().HaveCount(2);
        rows[0].StartedAt.Should().BeAfter(rows[1].StartedAt);
        rows.SelectMany(s => s.Events).Should().HaveCount(2);
    }

    [Fact]
    public async Task GetTimelineAsync_returns_empty_when_no_sessions()
    {
        var rows = await _service.GetTimelineAsync(10, 50, CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAchievementsAsync_returns_unlocked_first_then_by_code()
    {
        var now = DateTime.UtcNow;
        await SeedAsync(db =>
        {
            db.Achievements.AddRange(
                new Achievement { Id = UuidV7.NewGuid(), UserId = TestUserId, Code = "bg3.first_blood", Unlocked = false, ProgressNumerator = 0, ProgressDenominator = 1, UpdatedAt = now },
                new Achievement { Id = UuidV7.NewGuid(), UserId = TestUserId, Code = "bg3.party_full", Unlocked = true, ProgressNumerator = 4, ProgressDenominator = 4, UnlockedAt = now, UpdatedAt = now });
        });
        var rows = await _service.GetAchievementsAsync(CancellationToken.None);
        rows.Should().HaveCount(2);
        rows[0].Unlocked.Should().BeTrue();
        rows[0].Title.Should().Be("Companions");
    }

    [Fact]
    public async Task GetEventsAsync_filters_by_type_and_source()
    {
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", DateTime.UtcNow, """{"source":"bg3se","enemy":"Goblin"}"""),
                MakeEvent(TestUserId, "bg3.dialogue.choice_made", DateTime.UtcNow, """{"source":"bg3se","choice":"persuade"}"""),
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", DateTime.UtcNow, """{"source":"manual","enemy":"Spider"}"""));
        });
        var rows = await _service.GetEventsAsync(
            new EventFilter(new[] { "bg3.combat.enemy_killed" }, null, null, "bg3se"),
            100,
            CancellationToken.None);
        rows.Should().ContainSingle();
        rows.Single().PayloadJson.Should().Contain("Goblin");
    }

    [Fact]
    public async Task GetEventsAsync_filters_by_date_range()
    {
        var anchor = new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.region.entered", anchor.AddDays(-3)),
                MakeEvent(TestUserId, "bg3.region.entered", anchor.AddDays(-1)),
                MakeEvent(TestUserId, "bg3.region.entered", anchor.AddDays(1)));
        });
        var rows = await _service.GetEventsAsync(
            new EventFilter(Array.Empty<string>(), anchor.AddDays(-2), anchor, null),
            100,
            CancellationToken.None);
        rows.Should().ContainSingle();
    }

    [Fact]
    public async Task GetEventsAsync_returns_newest_first_capped_at_limit()
    {
        var baseTime = DateTime.UtcNow.AddHours(-10);
        await SeedAsync(db =>
        {
            for (var i = 0; i < 5; i++)
            {
                db.GameEvents.Add(MakeEvent(TestUserId, "bg3.test", baseTime.AddMinutes(i * 10)));
            }
        });
        var rows = await _service.GetEventsAsync(EventFilter.All, 3, CancellationToken.None);
        rows.Should().HaveCount(3);
        rows[0].OccurredAt.Should().BeAfter(rows[2].OccurredAt);
    }

    [Fact]
    public async Task GetDistinctEventTypesAsync_dedupes_and_orders()
    {
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", DateTime.UtcNow),
                MakeEvent(TestUserId, "bg3.combat.enemy_killed", DateTime.UtcNow.AddMinutes(1)),
                MakeEvent(TestUserId, "bg3.region.entered", DateTime.UtcNow.AddMinutes(2)));
        });
        var types = await _service.GetDistinctEventTypesAsync(CancellationToken.None);
        types.Should().Equal("bg3.combat.enemy_killed", "bg3.region.entered");
    }

    [Fact]
    public async Task GetDistinctEventSourcesAsync_extracts_from_payload()
    {
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent(TestUserId, "bg3.test", DateTime.UtcNow, """{"source":"bg3se"}"""),
                MakeEvent(TestUserId, "bg3.test", DateTime.UtcNow.AddMinutes(1), """{"source":"bg3-mock"}"""),
                MakeEvent(TestUserId, "bg3.test", DateTime.UtcNow.AddMinutes(2), """{"source":"bg3se"}"""),
                MakeEvent(TestUserId, "bg3.test", DateTime.UtcNow.AddMinutes(3), "{}"));
        });
        var sources = await _service.GetDistinctEventSourcesAsync(CancellationToken.None);
        sources.Should().Equal("bg3-mock", "bg3se");
    }

    private static GameEvent MakeEvent(string userId, string type, DateTime occurredAt, string? payload = null)
    {
        // The OutboxEnqueuingInterceptor would stamp ContentHash in the
        // desktop runtime; tests use a plain DbContext, so set a unique
        // hash here. Using EventId for uniqueness — the actual hash
        // content is irrelevant to these query tests.
        var id = UuidV7.NewGuid();
        return new GameEvent
        {
            EventId = id,
            UserId = userId,
            Type = type,
            OccurredAt = occurredAt,
            PayloadJson = payload ?? """{"source":"bg3-mock"}""",
            ContentHash = id.ToString("N"),
            ReceivedAt = occurredAt,
        };
    }

    private sealed class StubDbContextFactory(DbContextOptions<ReynDbContext> options)
        : IDbContextFactory<ReynDbContext>
    {
        public ReynDbContext CreateDbContext() => new(options);
    }
}
