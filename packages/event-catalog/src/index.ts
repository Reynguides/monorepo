import { z } from "zod";

/**
 * BG3 event catalog — single source of truth for the event types Reyn
 * ingests from the Script Extender Lua mod (Phase 10) or the desktop's
 * mock generator (Phase 9). Each schema validates the *payload* of an
 * event; the wire envelope ({eventId, type, occurredAt, payloadJson}) is
 * defined in apps/reyn-cloud-worker/src/schemas/sync.ts.
 *
 * The C# mirror lives at src/Reyn.Contracts/Events/Bg3EventCatalog.cs.
 * Keep them in sync by convention (Phase 11 may introduce a real codegen
 * step); each addition here MUST be reflected there.
 */

// ─── Shared shapes ────────────────────────────────────────────────────

/** Every event carries a source identifying who produced it. */
export const EventSource = z.enum(["bg3se", "bg3-mock", "manual"]);
export type EventSource = z.infer<typeof EventSource>;

const PartyMember = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
});

// ─── Lifecycle (3) ────────────────────────────────────────────────────
export const Bg3SessionStarted = z.object({ source: EventSource });
export const Bg3SessionEnded = z.object({ source: EventSource });
export const Bg3GameLoaded = z.object({ source: EventSource, saveName: z.string().max(128) });

// ─── Party (3) ────────────────────────────────────────────────────────
export const Bg3PartyMemberJoined = z.object({ source: EventSource, member: PartyMember });
export const Bg3PartyMemberLeft = z.object({ source: EventSource, memberId: z.string().min(1) });
export const Bg3PartyHpChanged = z.object({ source: EventSource, members: z.array(PartyMember).max(4) });

// ─── Character (3) ────────────────────────────────────────────────────
export const Bg3CharacterLevelUp = z.object({
  source: EventSource,
  characterId: z.string().min(1).max(64),
  level: z.number().int().positive().max(20),
});
export const Bg3CharacterDied = z.object({ source: EventSource, characterId: z.string().min(1) });
export const Bg3CharacterRevived = z.object({ source: EventSource, characterId: z.string().min(1) });

// ─── Combat (3) ───────────────────────────────────────────────────────
export const Bg3CombatStarted = z.object({ source: EventSource, encounter: z.string().max(128) });
export const Bg3CombatEnded = z.object({
  source: EventSource,
  victory: z.boolean(),
  roundCount: z.number().int().nonnegative(),
});
export const Bg3EnemyKilled = z.object({
  source: EventSource,
  enemy: z.string().min(1).max(128),
  byCharacterId: z.string().max(64).optional(),
});

// ─── Dialogue (3) ─────────────────────────────────────────────────────
export const Bg3DialogueStarted = z.object({ source: EventSource, npc: z.string().max(128) });
export const Bg3DialogueChoiceMade = z.object({
  source: EventSource,
  choice: z.enum(["persuade", "intimidate", "deceive", "diplomacy", "investigate", "other"]),
  outcome: z.enum(["pass", "fail", "neutral"]).optional(),
});
export const Bg3DialogueEnded = z.object({ source: EventSource, npc: z.string().max(128) });

// ─── Quest (3) ────────────────────────────────────────────────────────
export const Bg3QuestStarted = z.object({ source: EventSource, quest: z.string().min(1).max(128) });
export const Bg3QuestUpdated = z.object({
  source: EventSource,
  quest: z.string().min(1).max(128),
  step: z.string().max(128),
});
export const Bg3QuestCompleted = z.object({ source: EventSource, quest: z.string().min(1).max(128) });

// ─── Region (2) ───────────────────────────────────────────────────────
export const Bg3RegionEntered = z.object({ source: EventSource, region: z.string().min(1).max(128) });
export const Bg3RegionExited = z.object({ source: EventSource, region: z.string().min(1).max(128) });

// ─── Inventory (3) ────────────────────────────────────────────────────
export const Bg3InventoryItemPickedUp = z.object({
  source: EventSource,
  item: z.string().min(1).max(128),
  rarity: z.enum(["common", "uncommon", "rare", "very-rare", "legendary"]).optional(),
});
export const Bg3InventoryItemDropped = z.object({ source: EventSource, item: z.string().min(1).max(128) });
export const Bg3InventoryItemUsed = z.object({ source: EventSource, item: z.string().min(1).max(128) });

// ─── Rest (2) ─────────────────────────────────────────────────────────
export const Bg3RestShort = z.object({ source: EventSource });
export const Bg3RestLong = z.object({ source: EventSource, camp: z.boolean() });

// ─── Skill (2) ────────────────────────────────────────────────────────
export const Bg3SkillCheckRolled = z.object({
  source: EventSource,
  skill: z.string().min(1).max(64),
  dc: z.number().int().nonnegative().max(40),
  roll: z.number().int().nonnegative().max(40),
  success: z.boolean(),
});
export const Bg3SpellCast = z.object({
  source: EventSource,
  spell: z.string().min(1).max(128),
  byCharacterId: z.string().max(64).optional(),
});

// ─── Inspiration (1) ──────────────────────────────────────────────────
export const Bg3InspirationGained = z.object({
  source: EventSource,
  reason: z.string().max(128).optional(),
});

// ─── Registry ─────────────────────────────────────────────────────────

/**
 * Catalog map from type key to its schema. Used by the worker (Phase 11)
 * for catalog-validated push and by the mock generator to pick the right
 * payload shape.
 */
export const CATALOG = {
  "bg3.session.started": Bg3SessionStarted,
  "bg3.session.ended": Bg3SessionEnded,
  "bg3.game.loaded": Bg3GameLoaded,
  "bg3.party.member_joined": Bg3PartyMemberJoined,
  "bg3.party.member_left": Bg3PartyMemberLeft,
  "bg3.party.hp_changed": Bg3PartyHpChanged,
  "bg3.character.level_up": Bg3CharacterLevelUp,
  "bg3.character.died": Bg3CharacterDied,
  "bg3.character.revived": Bg3CharacterRevived,
  "bg3.combat.started": Bg3CombatStarted,
  "bg3.combat.ended": Bg3CombatEnded,
  "bg3.combat.enemy_killed": Bg3EnemyKilled,
  "bg3.dialogue.started": Bg3DialogueStarted,
  "bg3.dialogue.choice_made": Bg3DialogueChoiceMade,
  "bg3.dialogue.ended": Bg3DialogueEnded,
  "bg3.quest.started": Bg3QuestStarted,
  "bg3.quest.updated": Bg3QuestUpdated,
  "bg3.quest.completed": Bg3QuestCompleted,
  "bg3.region.entered": Bg3RegionEntered,
  "bg3.region.exited": Bg3RegionExited,
  "bg3.inventory.item_picked_up": Bg3InventoryItemPickedUp,
  "bg3.inventory.item_dropped": Bg3InventoryItemDropped,
  "bg3.inventory.item_used": Bg3InventoryItemUsed,
  "bg3.rest.short": Bg3RestShort,
  "bg3.rest.long": Bg3RestLong,
  "bg3.skill.check_rolled": Bg3SkillCheckRolled,
  "bg3.skill.spell_cast": Bg3SpellCast,
  "bg3.inspiration.gained": Bg3InspirationGained,
} as const;

export type Bg3EventType = keyof typeof CATALOG;

/** All known event type keys, useful for the worker's catalog-validated push and the mock generator. */
export const ALL_BG3_EVENT_TYPES = Object.keys(CATALOG) as readonly Bg3EventType[];

/** Categories surface in the events page chip groups. */
export const EVENT_CATEGORIES = {
  lifecycle: ["bg3.session.started", "bg3.session.ended", "bg3.game.loaded"],
  party: ["bg3.party.member_joined", "bg3.party.member_left", "bg3.party.hp_changed"],
  character: ["bg3.character.level_up", "bg3.character.died", "bg3.character.revived"],
  combat: ["bg3.combat.started", "bg3.combat.ended", "bg3.combat.enemy_killed"],
  dialogue: ["bg3.dialogue.started", "bg3.dialogue.choice_made", "bg3.dialogue.ended"],
  quest: ["bg3.quest.started", "bg3.quest.updated", "bg3.quest.completed"],
  region: ["bg3.region.entered", "bg3.region.exited"],
  inventory: ["bg3.inventory.item_picked_up", "bg3.inventory.item_dropped", "bg3.inventory.item_used"],
  rest: ["bg3.rest.short", "bg3.rest.long"],
  skill: ["bg3.skill.check_rolled", "bg3.skill.spell_cast"],
  inspiration: ["bg3.inspiration.gained"],
} as const satisfies Record<string, readonly Bg3EventType[]>;
