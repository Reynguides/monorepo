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
/// Edge-case coverage for the JSON extractor + filter branches that the
/// happy-path tests don't reach.
/// </summary>
public sealed class GameEventQueryServiceEdgeCaseTests : IAsyncDisposable
{
    private const string TestUserId = "user1";

    private readonly SqliteConnection _conn;
    private readonly DbContextOptions<ReynDbContext> _options;
    private readonly StubDbContextFactory _factory;
    private readonly GameEventQueryService _service;

    public GameEventQueryServiceEdgeCaseTests()
    {
        _conn = new SqliteConnection("Data Source=:memory:");
        _conn.Open();
        _options = new DbContextOptionsBuilder<ReynDbContext>().UseSqlite(_conn).Options;
        using (var db = new ReynDbContext(_options))
        {
            db.Database.Migrate();
        }
        _factory = new StubDbContextFactory(_options);
        _service = new GameEventQueryService(_factory, new StaticCurrentUserAccessor());
    }

    public async ValueTask DisposeAsync() => await _conn.DisposeAsync();

    private async Task SeedAsync(Action<ReynDbContext> mutate)
    {
        await using var db = new ReynDbContext(_options);
        mutate(db);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task GetCharacterLevelProgressionAsync_returns_empty_with_no_level_events()
    {
        var rows = await _service.GetCharacterLevelProgressionAsync(CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCharacterLevelProgressionAsync_skips_payload_without_level_field()
    {
        await SeedAsync(db =>
        {
            db.GameEvents.Add(MakeEvent("bg3.character.level_up", """{"source":"bg3-mock","other":1}"""));
        });
        var rows = await _service.GetCharacterLevelProgressionAsync(CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCharacterLevelProgressionAsync_handles_payload_with_no_value_after_field_name()
    {
        await SeedAsync(db =>
        {
            // Pathological payload — the field name has no colon.
            db.GameEvents.Add(MakeEvent("bg3.character.level_up", """{"level"}"""));
        });
        var rows = await _service.GetCharacterLevelProgressionAsync(CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetEventsAsync_handles_filter_with_only_FromUtc()
    {
        var anchor = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent("bg3.t", anchor.AddDays(-2)),
                MakeEvent("bg3.t", anchor.AddDays(2)));
        });
        var rows = await _service.GetEventsAsync(
            new EventFilter(Array.Empty<string>(), anchor, null, null),
            100,
            CancellationToken.None);
        rows.Should().ContainSingle();
    }

    [Fact]
    public async Task GetEventsAsync_handles_filter_with_only_ToUtc()
    {
        var anchor = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await SeedAsync(db =>
        {
            db.GameEvents.AddRange(
                MakeEvent("bg3.t", anchor.AddDays(-2)),
                MakeEvent("bg3.t", anchor.AddDays(2)));
        });
        var rows = await _service.GetEventsAsync(
            new EventFilter(Array.Empty<string>(), null, anchor, null),
            100,
            CancellationToken.None);
        rows.Should().ContainSingle();
    }

    [Fact]
    public async Task GetDistinctEventSourcesAsync_returns_empty_when_no_sources()
    {
        var rows = await _service.GetDistinctEventSourcesAsync(CancellationToken.None);
        rows.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTimelineAsync_eventsPerSession_caps_per_session_count()
    {
        var now = DateTime.UtcNow;
        await SeedAsync(db =>
        {
            db.PlaySessions.Add(new PlaySession
            {
                Id = UuidV7.NewGuid(),
                UserId = TestUserId,
                StartedAt = now.AddHours(-2),
                EndedAt = now,
                EventCount = 5,
            });
            for (var i = 0; i < 5; i++)
            {
                db.GameEvents.Add(MakeEvent("bg3.t", now.AddHours(-1).AddMinutes(i)));
            }
        });
        var rows = await _service.GetTimelineAsync(10, 2, CancellationToken.None);
        rows.Single().Events.Should().HaveCount(2);
    }

    private static GameEvent MakeEvent(string type, string payload, DateTime? at = null)
    {
        var id = UuidV7.NewGuid();
        return new GameEvent
        {
            EventId = id,
            UserId = TestUserId,
            Type = type,
            OccurredAt = at ?? DateTime.UtcNow,
            PayloadJson = payload,
            ContentHash = id.ToString("N"),
            ReceivedAt = at ?? DateTime.UtcNow,
        };
    }

    private static GameEvent MakeEvent(string type, DateTime at) => MakeEvent(type, """{"source":"bg3-mock"}""", at);

    private sealed class StubDbContextFactory(DbContextOptions<ReynDbContext> options)
        : IDbContextFactory<ReynDbContext>
    {
        public ReynDbContext CreateDbContext() => new(options);
    }
}
