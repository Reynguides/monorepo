using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Reyn.Application.Abstractions;
using Reyn.Domain;
using Reyn.Domain.Identifiers;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Queries;

namespace Reyn.Infrastructure.Demo;

/// <summary>
/// Phase 8 deterministic fixture generator: ~30 days of game events,
/// 6 play sessions, the achievement catalog with a mix of unlocked +
/// in-progress + locked rows. Used when the app is launched with
/// <c>--demo-mode</c> against an empty local DB, so charts/timeline/
/// achievements/events pages render populated screenshots without a
/// real BG3 session.
///
/// Phase 9 replaces this with the real <c>MockBg3EventGenerator</c> that
/// uses a weighted state machine over the BG3SE catalog. For now: a flat
/// seeded <see cref="Random"/> with a hand-picked event-type rotation.
/// </summary>
public sealed class DemoDataSeeder(ReynDbContext db, ICurrentUserAccessor currentUser)
{
    private static readonly string[] EventTypes =
    {
        "bg3.combat.enemy_killed",
        "bg3.dialogue.choice_made",
        "bg3.character.level_up",
        "bg3.region.entered",
        "bg3.quest.started",
        "bg3.quest.completed",
        "bg3.rest.long",
        "bg3.inventory.item_picked_up",
    };

    private static readonly string[] Sources = { "bg3-mock", "bg3se", "manual" };

    /// <summary>
    /// Idempotent: only seeds if the user has zero events. Returns the
    /// number of events created (0 means already-populated).
    /// </summary>
    public async Task<int> SeedAsync(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        var hasEvents = await db.GameEvents.AnyAsync(e => e.UserId == userId, ct).ConfigureAwait(false);
        if (hasEvents)
        {
            return 0;
        }

        var rand = new Random(0xBE3D);
        var now = DateTime.UtcNow.Date;
        var characterLevel = 1;
        var events = new List<GameEvent>();
        var sessions = new List<PlaySession>();

        // 6 sessions: roughly one every 5 days. Each session is 30-180 min.
        for (var s = 0; s < 6; s++)
        {
            var sessionStart = now.AddDays(-29 + s * 5).AddHours(18 + rand.Next(0, 4));
            var sessionEnd = sessionStart.AddMinutes(30 + rand.Next(0, 150));
            sessions.Add(new PlaySession
            {
                Id = UuidV7.NewGuid(),
                UserId = userId,
                StartedAt = sessionStart,
                EndedAt = sessionEnd,
                EventCount = 0,
                UpdatedAt = sessionEnd,
            });
        }

        // 30 days × ~3 events. Events cluster around session windows when
        // they overlap; otherwise scattered uniformly through the day.
        for (var d = 0; d < 30; d++)
        {
            var day = now.AddDays(-29 + d);
            var perDay = 2 + rand.Next(0, 3); // 2..4
            for (var i = 0; i < perDay; i++)
            {
                var sessionOnDay = sessions.FirstOrDefault(s => s.StartedAt.Date == day);
                var occurredAt = sessionOnDay is not null
                    ? sessionOnDay.StartedAt.AddMinutes(rand.Next(0, (int)(sessionOnDay.EndedAt!.Value - sessionOnDay.StartedAt).TotalMinutes))
                    : day.AddHours(rand.Next(8, 22)).AddMinutes(rand.Next(0, 60));
                var type = EventTypes[rand.Next(EventTypes.Length)];
                var source = Sources[rand.Next(Sources.Length)];
                var payload = BuildPayload(type, ref characterLevel, source, rand);
                var eventId = UuidV7.NewGuid();
                events.Add(new GameEvent
                {
                    EventId = eventId,
                    UserId = userId,
                    Type = type,
                    OccurredAt = occurredAt,
                    PayloadJson = payload,
                    // Stamp a unique ContentHash inline so the seeder works
                    // against any DbContext (including bare test contexts
                    // without the OutboxEnqueuingInterceptor wired up).
                    ContentHash = eventId.ToString("N"),
                    ReceivedAt = occurredAt,
                });
                if (sessionOnDay is not null)
                {
                    sessionOnDay.EventCount++;
                }
            }
        }

        // Achievements: 4 unlocked, 3 in-progress, 3 locked.
        var achievements = new List<Achievement>();
        var allCodes = AchievementCatalog.AllCodes.ToList();
        for (var i = 0; i < allCodes.Count; i++)
        {
            var code = allCodes[i];
            var (unlocked, num, den, unlockedAt) = i switch
            {
                < 4 => (true, 1, 1, (DateTime?)now.AddDays(-rand.Next(1, 28))),
                < 7 => (false, rand.Next(2, 8), 10, null),
                _ => (false, 0, 10, null),
            };
            achievements.Add(new Achievement
            {
                Id = UuidV7.NewGuid(),
                UserId = userId,
                Code = code,
                Unlocked = unlocked,
                ProgressNumerator = num,
                ProgressDenominator = den,
                UnlockedAt = unlockedAt,
                UpdatedAt = unlockedAt ?? now,
            });
        }

        db.PlaySessions.AddRange(sessions);
        db.GameEvents.AddRange(events);
        db.Achievements.AddRange(achievements);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return events.Count;
    }

    private static string BuildPayload(string type, ref int characterLevel, string source, Random rand)
    {
        return type switch
        {
            "bg3.character.level_up" => Bump(ref characterLevel, source),
            "bg3.combat.enemy_killed" => Encode(source, ("enemy", PickEnemy(rand))),
            "bg3.dialogue.choice_made" => Encode(source, ("choice", PickChoice(rand))),
            "bg3.region.entered" => Encode(source, ("region", PickRegion(rand))),
            "bg3.quest.started" or "bg3.quest.completed" => Encode(source, ("quest", PickQuest(rand))),
            "bg3.rest.long" => Encode(source, ("camp", "true")),
            "bg3.inventory.item_picked_up" => Encode(source, ("item", PickItem(rand))),
            _ => Encode(source),
        };
    }

    private static string Bump(ref int level, string source)
    {
        level++;
        return Encode(source, ("level", level.ToString(CultureInfo.InvariantCulture)));
    }

    private static string Encode(string source, params (string Key, string Value)[] extras)
    {
        var parts = new List<string> { $"\"source\":\"{source}\"" };
        foreach (var (key, value) in extras)
        {
            parts.Add(int.TryParse(value, out _)
                ? $"\"{key}\":{value}"
                : $"\"{key}\":\"{value}\"");
        }
        return "{" + string.Join(",", parts) + "}";
    }

    private static string PickEnemy(Random rand) =>
        new[] { "Goblin Scout", "Gnoll Hunter", "Phase Spider", "Intellect Devourer", "Bulette" }[rand.Next(5)];

    private static string PickChoice(Random rand) =>
        new[] { "persuade", "intimidate", "deceive", "diplomacy", "investigate" }[rand.Next(5)];

    private static string PickRegion(Random rand) =>
        new[] { "Druid Grove", "Goblin Camp", "Underdark", "Mountain Pass", "Last Light Inn" }[rand.Next(5)];

    private static string PickQuest(Random rand) =>
        new[] { "Save the First Druid", "Find the Missing Druids", "Rescue Mayrina", "Defeat the Goblin Leaders" }[rand.Next(4)];

    private static string PickItem(Random rand) =>
        new[] { "Healing Potion", "Studded Leather", "Longsword +1", "Scroll of Sleep", "Iron Flask" }[rand.Next(5)];
}
