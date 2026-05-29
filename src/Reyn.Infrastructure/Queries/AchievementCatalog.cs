namespace Reyn.Infrastructure.Queries;

/// <summary>
/// Phase-8 placeholder catalog. The achievement codes stored in
/// <c>Reyn.Domain.Achievement.Code</c> are looked up here for their
/// human-readable title + description. Phase 11 will source these from a
/// shared TS/JSON catalog matching <c>packages/event-catalog</c>.
/// </summary>
internal static class AchievementCatalog
{
    private static readonly Dictionary<string, (string Title, string Description)> Entries = new()
    {
        ["bg3.first_blood"] = ("First Blood", "Land the first killing blow of a campaign."),
        ["bg3.exploration_5_regions"] = ("Worldwalker", "Visit five distinct regions."),
        ["bg3.dialogue_perfect_persuasion"] = ("Silver Tongue", "Pass three persuasion checks in a single dialogue."),
        ["bg3.rest_long_3"] = ("Well Rested", "Take three long rests in a single day of playtime."),
        ["bg3.party_full"] = ("Companions", "Recruit a full party of four."),
        ["bg3.combat_perfect"] = ("Untouchable", "Win a combat without taking damage."),
        ["bg3.character_level_5"] = ("Apprentice", "Reach character level 5."),
        ["bg3.character_level_10"] = ("Adventurer", "Reach character level 10."),
        ["bg3.inspiration_used_10"] = ("Inspired", "Use inspiration ten times."),
        ["bg3.session_marathon"] = ("Marathon", "Play for six continuous hours."),
    };

    public static string TitleFor(string code) =>
        Entries.TryGetValue(code, out var entry) ? entry.Title : code;

    public static string DescriptionFor(string code) =>
        Entries.TryGetValue(code, out var entry) ? entry.Description : "Custom achievement.";

    public static IEnumerable<string> AllCodes => Entries.Keys;
}
