namespace Reyn.Contracts.Events;

/// <summary>
/// String constants for every event type in the BG3 catalog. Mirrors
/// <c>packages/event-catalog/src/index.ts:CATALOG</c> — every addition
/// here MUST be reflected there (Phase 11 may introduce a real codegen
/// step that derives this file).
/// </summary>
public static class Bg3EventTypes
{
    // Lifecycle
    public const string SessionStarted = "bg3.session.started";
    public const string SessionEnded = "bg3.session.ended";
    public const string GameLoaded = "bg3.game.loaded";

    // Party
    public const string PartyMemberJoined = "bg3.party.member_joined";
    public const string PartyMemberLeft = "bg3.party.member_left";
    public const string PartyHpChanged = "bg3.party.hp_changed";

    // Character
    public const string CharacterLevelUp = "bg3.character.level_up";
    public const string CharacterDied = "bg3.character.died";
    public const string CharacterRevived = "bg3.character.revived";

    // Combat
    public const string CombatStarted = "bg3.combat.started";
    public const string CombatEnded = "bg3.combat.ended";
    public const string EnemyKilled = "bg3.combat.enemy_killed";

    // Dialogue
    public const string DialogueStarted = "bg3.dialogue.started";
    public const string DialogueChoiceMade = "bg3.dialogue.choice_made";
    public const string DialogueEnded = "bg3.dialogue.ended";

    // Quest
    public const string QuestStarted = "bg3.quest.started";
    public const string QuestUpdated = "bg3.quest.updated";
    public const string QuestCompleted = "bg3.quest.completed";

    // Region
    public const string RegionEntered = "bg3.region.entered";
    public const string RegionExited = "bg3.region.exited";

    // Inventory
    public const string ItemPickedUp = "bg3.inventory.item_picked_up";
    public const string ItemDropped = "bg3.inventory.item_dropped";
    public const string ItemUsed = "bg3.inventory.item_used";

    // Rest
    public const string RestShort = "bg3.rest.short";
    public const string RestLong = "bg3.rest.long";

    // Skill
    public const string SkillCheckRolled = "bg3.skill.check_rolled";
    public const string SpellCast = "bg3.skill.spell_cast";

    // Inspiration
    public const string InspirationGained = "bg3.inspiration.gained";

    /// <summary>
    /// Every known event type. Useful for the worker's catalog-validated
    /// push (Phase 11) and the mock generator's type rotation.
    /// </summary>
    public static readonly IReadOnlyList<string> All = new[]
    {
        SessionStarted, SessionEnded, GameLoaded,
        PartyMemberJoined, PartyMemberLeft, PartyHpChanged,
        CharacterLevelUp, CharacterDied, CharacterRevived,
        CombatStarted, CombatEnded, EnemyKilled,
        DialogueStarted, DialogueChoiceMade, DialogueEnded,
        QuestStarted, QuestUpdated, QuestCompleted,
        RegionEntered, RegionExited,
        ItemPickedUp, ItemDropped, ItemUsed,
        RestShort, RestLong,
        SkillCheckRolled, SpellCast,
        InspirationGained,
    };
}
