using Reyn.Application.Queries;

namespace Reyn.Desktop.ViewModels.Tests.Stubs;

/// <summary>
/// In-memory <see cref="IGameEventQueryService"/> for VM unit tests. Each
/// query returns a configurable list; the EventsPage filter tests poke
/// these directly to verify the chip/source/date wiring.
/// </summary>
public sealed class StubQueryService : IGameEventQueryService
{
    public List<DailyEventCount> EventsPerDay { get; } = new();
    public List<DailyPlaytimeMinutes> PlaytimePerDay { get; } = new();
    public List<CharacterLevelPoint> CharacterLevels { get; } = new();
    public List<TimelineSession> Timeline { get; } = new();
    public List<AchievementProgress> Achievements { get; } = new();
    public List<EventLogRow> Events { get; } = new();
    public List<string> EventTypes { get; } = new();
    public List<string> EventSources { get; } = new();

    /// <summary>Captured filter arg of the most recent GetEventsAsync call.</summary>
    public EventFilter? LastFilter { get; private set; }

    public int GetEventsCallCount { get; private set; }

    public Task<IReadOnlyList<DailyEventCount>> GetEventsPerDayAsync(int days, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<DailyEventCount>>(EventsPerDay);

    public Task<IReadOnlyList<DailyPlaytimeMinutes>> GetPlaytimePerDayAsync(int days, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<DailyPlaytimeMinutes>>(PlaytimePerDay);

    public Task<IReadOnlyList<CharacterLevelPoint>> GetCharacterLevelProgressionAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<CharacterLevelPoint>>(CharacterLevels);

    public Task<IReadOnlyList<TimelineSession>> GetTimelineAsync(int sessionLimit, int eventsPerSession, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<TimelineSession>>(Timeline);

    public Task<IReadOnlyList<AchievementProgress>> GetAchievementsAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<AchievementProgress>>(Achievements);

    public Task<IReadOnlyList<EventLogRow>> GetEventsAsync(EventFilter filter, int limit, CancellationToken ct)
    {
        LastFilter = filter;
        GetEventsCallCount++;
        IEnumerable<EventLogRow> projected = Events;
        if (filter.Types.Count > 0)
        {
            projected = projected.Where(e => filter.Types.Contains(e.Type));
        }
        if (filter.FromUtc is { } from)
        {
            projected = projected.Where(e => e.OccurredAt >= from);
        }
        if (filter.ToUtc is { } to)
        {
            projected = projected.Where(e => e.OccurredAt <= to);
        }
        if (!string.IsNullOrEmpty(filter.Source))
        {
            projected = projected.Where(e => string.Equals(e.Source, filter.Source, StringComparison.OrdinalIgnoreCase));
        }
        return Task.FromResult<IReadOnlyList<EventLogRow>>(projected.Take(limit).ToList());
    }

    public Task<IReadOnlyList<string>> GetDistinctEventTypesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<string>>(EventTypes);

    public Task<IReadOnlyList<string>> GetDistinctEventSourcesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<string>>(EventSources);
}
