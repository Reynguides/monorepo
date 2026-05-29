namespace Reyn.Application.Queries;

/// <summary>
/// Dashboard tile: how many events landed on this UTC day. Used by the
/// events-per-day bar chart.
/// </summary>
public sealed record DailyEventCount(DateOnly Day, int Count);

/// <summary>
/// Dashboard tile: total minutes played on this UTC day, summed across
/// every closed PlaySession. Used by the playtime-per-day line chart.
/// </summary>
public sealed record DailyPlaytimeMinutes(DateOnly Day, double Minutes);

/// <summary>
/// Dashboard tile: highest character level observed by this point in time.
/// Derived from the event stream (character-level-up events) and projected
/// as a step-line.
/// </summary>
public sealed record CharacterLevelPoint(DateTime ObservedAt, int Level);

/// <summary>
/// Timeline page: a contiguous play-session with its associated events.
/// </summary>
public sealed record TimelineSession(
    Guid SessionId,
    DateTime StartedAt,
    DateTime? EndedAt,
    int EventCount,
    IReadOnlyList<TimelineEvent> Events);

public sealed record TimelineEvent(
    Guid EventId,
    string Type,
    DateTime OccurredAt,
    string PayloadJson);

/// <summary>
/// Achievement progress for a single catalog code. <see cref="UnlockedAt"/>
/// is non-null iff the achievement has been earned. Numerator/Denominator
/// drive the progress bar.
/// </summary>
public sealed record AchievementProgress(
    string Code,
    string Title,
    string Description,
    bool Unlocked,
    int Numerator,
    int Denominator,
    DateTime? UnlockedAt);

/// <summary>
/// Events page row — flat projection of <c>GameEvent</c>. Source is parsed
/// from the payload's <c>source</c> field when present.
/// </summary>
public sealed record EventLogRow(
    Guid EventId,
    string Type,
    DateTime OccurredAt,
    string PayloadJson,
    string Source);

/// <summary>
/// Filter values for the events page. Empty <see cref="Types"/> means "all".
/// Null bounds mean unbounded on that side.
/// </summary>
public sealed record EventFilter(
    IReadOnlyCollection<string> Types,
    DateTime? FromUtc,
    DateTime? ToUtc,
    string? Source)
{
    public static readonly EventFilter All = new(Array.Empty<string>(), null, null, null);
}
