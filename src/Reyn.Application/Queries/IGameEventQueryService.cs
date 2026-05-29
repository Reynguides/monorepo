namespace Reyn.Application.Queries;

/// <summary>
/// All read-side projections the dashboard pages need. Implementations
/// (Infrastructure) talk to the local SQLite via EF Core; views consume
/// only the DTOs in this namespace. Per ADR-0009: no DbContext leaks into
/// the UI layer.
/// </summary>
public interface IGameEventQueryService
{
    /// <summary>Events per UTC day for the trailing <paramref name="days"/> window.</summary>
    Task<IReadOnlyList<DailyEventCount>> GetEventsPerDayAsync(int days, CancellationToken ct);

    /// <summary>Minutes played per UTC day for the trailing window.</summary>
    Task<IReadOnlyList<DailyPlaytimeMinutes>> GetPlaytimePerDayAsync(int days, CancellationToken ct);

    /// <summary>Character-level checkpoints in occurrence order.</summary>
    Task<IReadOnlyList<CharacterLevelPoint>> GetCharacterLevelProgressionAsync(CancellationToken ct);

    /// <summary>Sessions newest-first, each carrying up to <paramref name="eventsPerSession"/> recent events.</summary>
    Task<IReadOnlyList<TimelineSession>> GetTimelineAsync(int sessionLimit, int eventsPerSession, CancellationToken ct);

    /// <summary>Achievement state for the entire catalog, locked + unlocked.</summary>
    Task<IReadOnlyList<AchievementProgress>> GetAchievementsAsync(CancellationToken ct);

    /// <summary>
    /// Events page rows matching the filter, newest first, capped at
    /// <paramref name="limit"/>. The filter is applied in SQL.
    /// </summary>
    Task<IReadOnlyList<EventLogRow>> GetEventsAsync(EventFilter filter, int limit, CancellationToken ct);

    /// <summary>Distinct event types in the local DB — drives the filter chip set.</summary>
    Task<IReadOnlyList<string>> GetDistinctEventTypesAsync(CancellationToken ct);

    /// <summary>Distinct event sources observed locally — drives the source dropdown.</summary>
    Task<IReadOnlyList<string>> GetDistinctEventSourcesAsync(CancellationToken ct);
}
