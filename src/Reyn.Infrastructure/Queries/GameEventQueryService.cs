using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Reyn.Application.Abstractions;
using Reyn.Application.Queries;
using Reyn.Infrastructure.Persistence;

namespace Reyn.Infrastructure.Queries;

/// <summary>
/// EF Core projection of <see cref="ReynDbContext"/> to the dashboard DTOs.
/// Filters by the current user; the desktop runs single-user but the rows
/// carry user_id so multi-account local installs (a Phase 11+ feature)
/// don't bleed across.
///
/// Consumes <see cref="IDbContextFactory{TContext}"/> instead of a scoped
/// DbContext so this service can be transient/singleton without smuggling
/// a captive scope into page ViewModels.
/// </summary>
public sealed class GameEventQueryService(IDbContextFactory<ReynDbContext> dbFactory, ICurrentUserAccessor currentUser) : IGameEventQueryService
{
    private ReynDbContext NewContext() => dbFactory.CreateDbContext();

    public async Task<IReadOnlyList<DailyEventCount>> GetEventsPerDayAsync(int days, CancellationToken ct)
    {
        await using var db = NewContext();
        var since = DateTime.UtcNow.Date.AddDays(-days + 1);
        var userId = currentUser.UserId;
        var rows = await db.GameEvents
            .Where(e => e.UserId == userId && e.OccurredAt >= since)
            .Select(e => new { Day = e.OccurredAt.Date })
            .GroupBy(x => x.Day)
            .Select(g => new { Day = g.Key, Count = g.Count() })
            .ToListAsync(ct).ConfigureAwait(false);

        return rows
            .OrderBy(r => r.Day)
            .Select(r => new DailyEventCount(DateOnly.FromDateTime(r.Day), r.Count))
            .ToList();
    }

    public async Task<IReadOnlyList<DailyPlaytimeMinutes>> GetPlaytimePerDayAsync(int days, CancellationToken ct)
    {
        await using var db = NewContext();
        var since = DateTime.UtcNow.Date.AddDays(-days + 1);
        var userId = currentUser.UserId;
        var sessions = await db.PlaySessions
            .Where(s => s.UserId == userId && s.StartedAt >= since && s.EndedAt != null)
            .Select(s => new { s.StartedAt, EndedAt = s.EndedAt!.Value })
            .ToListAsync(ct).ConfigureAwait(false);

        return sessions
            .GroupBy(s => s.StartedAt.Date)
            .Select(g => new DailyPlaytimeMinutes(
                DateOnly.FromDateTime(g.Key),
                g.Sum(s => (s.EndedAt - s.StartedAt).TotalMinutes)))
            .OrderBy(p => p.Day)
            .ToList();
    }

    public async Task<IReadOnlyList<CharacterLevelPoint>> GetCharacterLevelProgressionAsync(CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        var levelEvents = await db.GameEvents
            .Where(e => e.UserId == userId && e.Type == "bg3.character.level_up")
            .OrderBy(e => e.OccurredAt)
            .Select(e => new { e.OccurredAt, e.PayloadJson })
            .ToListAsync(ct).ConfigureAwait(false);

        var result = new List<CharacterLevelPoint>(levelEvents.Count);
        foreach (var ev in levelEvents)
        {
            if (TryReadIntField(ev.PayloadJson, "level", out var level))
            {
                result.Add(new CharacterLevelPoint(ev.OccurredAt, level));
            }
        }
        return result;
    }

    public async Task<IReadOnlyList<TimelineSession>> GetTimelineAsync(int sessionLimit, int eventsPerSession, CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        var sessions = await db.PlaySessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.StartedAt)
            .Take(sessionLimit)
            .ToListAsync(ct).ConfigureAwait(false);

        if (sessions.Count == 0)
        {
            return Array.Empty<TimelineSession>();
        }

        var earliest = sessions.Min(s => s.StartedAt);
        var latest = sessions.Max(s => s.EndedAt ?? DateTime.UtcNow);
        var eventsInWindow = await db.GameEvents
            .Where(e => e.UserId == userId && e.OccurredAt >= earliest && e.OccurredAt <= latest)
            .OrderByDescending(e => e.OccurredAt)
            .Select(e => new { e.EventId, e.Type, e.OccurredAt, e.PayloadJson })
            .ToListAsync(ct).ConfigureAwait(false);

        return sessions
            .Select(s =>
            {
                var inSession = eventsInWindow
                    .Where(e => e.OccurredAt >= s.StartedAt && e.OccurredAt <= (s.EndedAt ?? DateTime.UtcNow))
                    .Take(eventsPerSession)
                    .Select(e => new TimelineEvent(e.EventId, e.Type, e.OccurredAt, e.PayloadJson))
                    .ToList();
                return new TimelineSession(s.Id, s.StartedAt, s.EndedAt, s.EventCount, inSession);
            })
            .ToList();
    }

    public async Task<IReadOnlyList<AchievementProgress>> GetAchievementsAsync(CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        var rows = await db.Achievements
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.Unlocked)
            .ThenBy(a => a.Code)
            .ToListAsync(ct).ConfigureAwait(false);

        return rows.Select(a => new AchievementProgress(
            a.Code,
            AchievementCatalog.TitleFor(a.Code),
            AchievementCatalog.DescriptionFor(a.Code),
            a.Unlocked,
            a.ProgressNumerator,
            a.ProgressDenominator,
            a.UnlockedAt)).ToList();
    }

    public async Task<IReadOnlyList<EventLogRow>> GetEventsAsync(EventFilter filter, int limit, CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        var query = db.GameEvents.Where(e => e.UserId == userId).AsQueryable();
        if (filter.Types.Count > 0)
        {
            var types = filter.Types.ToList();
            query = query.Where(e => types.Contains(e.Type));
        }
        if (filter.FromUtc is { } from)
        {
            query = query.Where(e => e.OccurredAt >= from);
        }
        if (filter.ToUtc is { } to)
        {
            query = query.Where(e => e.OccurredAt <= to);
        }

        var rows = await query
            .OrderByDescending(e => e.OccurredAt)
            .Take(limit)
            .Select(e => new { e.EventId, e.Type, e.OccurredAt, e.PayloadJson })
            .ToListAsync(ct).ConfigureAwait(false);

        var projected = rows
            .Select(r => new EventLogRow(r.EventId, r.Type, r.OccurredAt, r.PayloadJson, ExtractSource(r.PayloadJson)));
        if (!string.IsNullOrEmpty(filter.Source))
        {
            projected = projected.Where(r => string.Equals(r.Source, filter.Source, StringComparison.OrdinalIgnoreCase));
        }
        return projected.ToList();
    }

    public async Task<IReadOnlyList<string>> GetDistinctEventTypesAsync(CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        return await db.GameEvents
            .Where(e => e.UserId == userId)
            .Select(e => e.Type)
            .Distinct()
            .OrderBy(t => t)
            .ToListAsync(ct).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<string>> GetDistinctEventSourcesAsync(CancellationToken ct)
    {
        await using var db = NewContext();
        var userId = currentUser.UserId;
        var payloads = await db.GameEvents
            .Where(e => e.UserId == userId)
            .Select(e => e.PayloadJson)
            .ToListAsync(ct).ConfigureAwait(false);
        return payloads
            .Select(ExtractSource)
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>
    /// Minimal payload field extractor: avoids spinning up a full JSON
    /// reader for two flat string lookups. The payloads we ship in Phase 8
    /// fixtures are flat key/value JSON; if Phase 10+ Lua mod emits nested
    /// objects, swap this for System.Text.Json.
    /// </summary>
    private static string ExtractSource(string payloadJson) =>
        ReadStringField(payloadJson, "source") ?? string.Empty;

    private static string? ReadStringField(string json, string field)
    {
        var marker = $"\"{field}\"";
        var idx = json.IndexOf(marker, StringComparison.Ordinal);
        if (idx < 0)
        {
            return null;
        }
        var colon = json.IndexOf(':', idx + marker.Length);
        if (colon < 0)
        {
            return null;
        }
        var firstQuote = json.IndexOf('"', colon + 1);
        if (firstQuote < 0)
        {
            return null;
        }
        var secondQuote = json.IndexOf('"', firstQuote + 1);
        if (secondQuote < 0)
        {
            return null;
        }
        return json.Substring(firstQuote + 1, secondQuote - firstQuote - 1);
    }

    private static bool TryReadIntField(string json, string field, out int value)
    {
        var marker = $"\"{field}\"";
        var idx = json.IndexOf(marker, StringComparison.Ordinal);
        if (idx < 0)
        {
            value = 0;
            return false;
        }
        var colon = json.IndexOf(':', idx + marker.Length);
        if (colon < 0)
        {
            value = 0;
            return false;
        }
        var start = colon + 1;
        while (start < json.Length && char.IsWhiteSpace(json[start]))
        {
            start++;
        }
        var end = start;
        while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '-'))
        {
            end++;
        }
        return int.TryParse(
            json.AsSpan(start, end - start),
            NumberStyles.Integer,
            CultureInfo.InvariantCulture,
            out value);
    }
}
