-- Reyn BG3 event catalog — Lua mirror of packages/event-catalog.
-- BG3SE Lua is 5.1; keep code compatible with both 5.1 and 5.4.
--
-- Every addition here MUST be reflected in:
--   - packages/event-catalog/src/index.ts (the TS source of truth)
--   - src/Reyn.Contracts/Events/Bg3EventCatalog.cs (the C# mirror)
-- Phase 11 may add a pnpm gen:lua codegen step.

local Catalog = {}

-- Lifecycle
Catalog.SessionStarted     = "bg3.session.started"
Catalog.SessionEnded       = "bg3.session.ended"
Catalog.GameLoaded         = "bg3.game.loaded"

-- Party
Catalog.PartyMemberJoined  = "bg3.party.member_joined"
Catalog.PartyMemberLeft    = "bg3.party.member_left"
Catalog.PartyHpChanged     = "bg3.party.hp_changed"

-- Character
Catalog.CharacterLevelUp   = "bg3.character.level_up"
Catalog.CharacterDied      = "bg3.character.died"
Catalog.CharacterRevived   = "bg3.character.revived"

-- Combat
Catalog.CombatStarted      = "bg3.combat.started"
Catalog.CombatEnded        = "bg3.combat.ended"
Catalog.EnemyKilled        = "bg3.combat.enemy_killed"

-- Dialogue
Catalog.DialogueStarted    = "bg3.dialogue.started"
Catalog.DialogueChoiceMade = "bg3.dialogue.choice_made"
Catalog.DialogueEnded      = "bg3.dialogue.ended"

-- Quest
Catalog.QuestStarted       = "bg3.quest.started"
Catalog.QuestUpdated       = "bg3.quest.updated"
Catalog.QuestCompleted     = "bg3.quest.completed"

-- Region
Catalog.RegionEntered      = "bg3.region.entered"
Catalog.RegionExited       = "bg3.region.exited"

-- Inventory
Catalog.ItemPickedUp       = "bg3.inventory.item_picked_up"
Catalog.ItemDropped        = "bg3.inventory.item_dropped"
Catalog.ItemUsed           = "bg3.inventory.item_used"

-- Rest
Catalog.RestShort          = "bg3.rest.short"
Catalog.RestLong           = "bg3.rest.long"

-- Skill
Catalog.SkillCheckRolled   = "bg3.skill.check_rolled"
Catalog.SpellCast          = "bg3.skill.spell_cast"

-- Inspiration
Catalog.InspirationGained  = "bg3.inspiration.gained"

-- All catalog types in a list (mirrors Bg3EventTypes.All on the C# side).
Catalog.All = {
    Catalog.SessionStarted, Catalog.SessionEnded, Catalog.GameLoaded,
    Catalog.PartyMemberJoined, Catalog.PartyMemberLeft, Catalog.PartyHpChanged,
    Catalog.CharacterLevelUp, Catalog.CharacterDied, Catalog.CharacterRevived,
    Catalog.CombatStarted, Catalog.CombatEnded, Catalog.EnemyKilled,
    Catalog.DialogueStarted, Catalog.DialogueChoiceMade, Catalog.DialogueEnded,
    Catalog.QuestStarted, Catalog.QuestUpdated, Catalog.QuestCompleted,
    Catalog.RegionEntered, Catalog.RegionExited,
    Catalog.ItemPickedUp, Catalog.ItemDropped, Catalog.ItemUsed,
    Catalog.RestShort, Catalog.RestLong,
    Catalog.SkillCheckRolled, Catalog.SpellCast,
    Catalog.InspirationGained,
}

return Catalog
