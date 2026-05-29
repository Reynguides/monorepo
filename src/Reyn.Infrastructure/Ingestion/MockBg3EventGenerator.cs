using System.Globalization;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;
using Reyn.Contracts.Events;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Phase-9 stand-in for the BG3 Script Extender mod. Drives a small
/// weighted state machine over the catalog:
///   - Explore mode (default): mostly region/dialogue/quest events.
///   - Combat mode (entered after a session start or after a region):
///     bursts of combat events (enemy killed, spell cast, skill check)
///     until a victory/defeat ends it.
///   - Rest mode (interleaved): rest events trigger a "calm" payload run.
///
/// Inter-event delay is jittered ±50% around <see cref="MockEventGeneratorOptions.MeanInterval"/>.
/// The state transitions plus payload picks share a single
/// <see cref="Random"/> seeded by <see cref="MockEventGeneratorOptions.Seed"/>
/// when present, which keeps demo-mode screenshots reproducible.
/// </summary>
public sealed class MockBg3EventGenerator : IGameEventSource
{
    private static readonly string[] Enemies = { "Goblin Scout", "Gnoll Hunter", "Phase Spider", "Intellect Devourer", "Bulette", "Hook Horror" };
    private static readonly string[] Regions = { "Druid Grove", "Goblin Camp", "Underdark", "Mountain Pass", "Last Light Inn", "Moonrise Towers" };
    private static readonly string[] Quests = { "Save the First Druid", "Find the Missing Druids", "Rescue Mayrina", "Defeat the Goblin Leaders", "Search the Cellar" };
    private static readonly string[] Items = { "Healing Potion", "Studded Leather", "Longsword +1", "Scroll of Sleep", "Iron Flask", "Whispering Promise" };
    private static readonly string[] Spells = { "Magic Missile", "Healing Word", "Fireball", "Misty Step", "Eldritch Blast" };
    private static readonly string[] DialogueChoices = { "persuade", "intimidate", "deceive", "diplomacy", "investigate" };

    private readonly TimeSpan _meanInterval;
    private readonly Random _rand;

    public MockBg3EventGenerator(IOptions<MockEventGeneratorOptions> options)
    {
        var opts = options.Value;
        _meanInterval = opts.MeanInterval;
        _rand = opts.Seed is { } seed ? new Random(seed) : new Random();
    }

    public string SourceName => "bg3-mock";

    public async IAsyncEnumerable<IncomingGameEvent> StreamAsync([EnumeratorCancellation] CancellationToken ct)
    {
        // Bootstrap: every session starts with a session_started + a region.
        yield return Build(Bg3EventTypes.SessionStarted, """{"source":"bg3-mock"}""");
        var characterLevel = 1;
        var mode = Mode.Explore;

        while (!ct.IsCancellationRequested)
        {
            await DelayWithJitterAsync(ct).ConfigureAwait(false);
            if (ct.IsCancellationRequested)
            {
                yield break;
            }

            var (next, type, payload) = PickNext(mode, ref characterLevel);
            mode = next;
            yield return Build(type, payload);
        }
    }

    private async Task DelayWithJitterAsync(CancellationToken ct)
    {
        // Jitter inside ±50% of the mean — keeps the stream from feeling
        // robotic without producing extreme outliers.
        var jitter = 0.5 + _rand.NextDouble();
        var delay = TimeSpan.FromMilliseconds(_meanInterval.TotalMilliseconds * jitter);
        try
        {
            await Task.Delay(delay, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Caller will see cancellation through the enumerator.
        }
    }

    private (Mode Next, string Type, string Payload) PickNext(Mode mode, ref int characterLevel)
    {
        return mode switch
        {
            Mode.Combat => PickCombat(ref characterLevel),
            Mode.Rest => PickRest(),
            _ => PickExplore(ref characterLevel),
        };
    }

    private (Mode, string, string) PickExplore(ref int characterLevel)
    {
        var dice = _rand.Next(100);
        if (dice < 30)
        {
            return (Mode.Combat, Bg3EventTypes.CombatStarted, EncodePayload(("encounter", Pick(Enemies))));
        }
        if (dice < 45)
        {
            return (Mode.Rest, Bg3EventTypes.RestLong, """{"source":"bg3-mock","camp":true}""");
        }
        if (dice < 60)
        {
            return (Mode.Explore, Bg3EventTypes.RegionEntered, EncodePayload(("region", Pick(Regions))));
        }
        if (dice < 75)
        {
            return (Mode.Explore, Bg3EventTypes.DialogueChoiceMade, EncodePayload(("choice", Pick(DialogueChoices))));
        }
        if (dice < 88)
        {
            return (Mode.Explore, Bg3EventTypes.ItemPickedUp, EncodePayload(("item", Pick(Items))));
        }
        if (dice < 95)
        {
            return (Mode.Explore, Bg3EventTypes.QuestStarted, EncodePayload(("quest", Pick(Quests))));
        }
        characterLevel = Math.Min(20, characterLevel + 1);
        return (Mode.Explore, Bg3EventTypes.CharacterLevelUp,
            EncodePayload(("characterId", "pc-1"), ("level", characterLevel.ToString(CultureInfo.InvariantCulture))));
    }

    private (Mode, string, string) PickCombat(ref int characterLevel)
    {
        var dice = _rand.Next(100);
        if (dice < 40)
        {
            return (Mode.Combat, Bg3EventTypes.EnemyKilled, EncodePayload(("enemy", Pick(Enemies))));
        }
        if (dice < 70)
        {
            return (Mode.Combat, Bg3EventTypes.SpellCast, EncodePayload(("spell", Pick(Spells))));
        }
        if (dice < 85)
        {
            return (Mode.Combat, Bg3EventTypes.SkillCheckRolled,
                EncodePayload(
                    ("skill", "athletics"),
                    ("dc", "15"),
                    ("roll", _rand.Next(1, 21).ToString(CultureInfo.InvariantCulture)),
                    ("success", _rand.Next(2) == 1 ? "true" : "false")));
        }
        // Combat ends — back to explore.
        var victory = _rand.Next(10) < 8;
        return (Mode.Explore, Bg3EventTypes.CombatEnded,
            EncodePayload(("victory", victory ? "true" : "false"), ("roundCount", _rand.Next(3, 9).ToString(CultureInfo.InvariantCulture))));
    }

    private static (Mode, string, string) PickRest()
    {
        // Rest always produces one rest event, then bounces to explore.
        return (Mode.Explore, Bg3EventTypes.InspirationGained,
            EncodePayload(("reason", "long rest reflection")));
    }

    private string Pick(string[] options) => options[_rand.Next(options.Length)];

    private static IncomingGameEvent Build(string type, string payload) =>
        new(type, DateTime.UtcNow, payload);

    private static string EncodePayload(params (string Key, string Value)[] extras)
    {
        var parts = new List<string> { "\"source\":\"bg3-mock\"" };
        foreach (var (key, value) in extras)
        {
            parts.Add(IsNumericOrBoolLiteral(value)
                ? $"\"{key}\":{value}"
                : $"\"{key}\":\"{value}\"");
        }
        return "{" + string.Join(",", parts) + "}";
    }

    private static bool IsNumericOrBoolLiteral(string value) =>
        value is "true" or "false" || int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out _);

    private enum Mode
    {
        Explore,
        Combat,
        Rest,
    }
}
