# BG3 event catalog

The catalog is the single source of truth for the event types Reyn
ingests. It lives in `packages/event-catalog/src/index.ts` as Zod
schemas; the C# (`src/Reyn.Contracts/Events/Bg3EventCatalog.cs`) and Lua
(`apps/reyn-bg3-mod/ScriptExtender/Lua/Catalog.lua`) sides hand-mirror
the type list by convention. Every addition must update all three.

## 28 catalog types

| Category | Type key | Payload fields |
|----------|----------|----------------|
| Lifecycle | `bg3.session.started` | `source` |
| Lifecycle | `bg3.session.ended` | `source` |
| Lifecycle | `bg3.game.loaded` | `source`, `saveName` |
| Party | `bg3.party.member_joined` | `source`, `member { id, name, hp, maxHp }` |
| Party | `bg3.party.member_left` | `source`, `memberId` |
| Party | `bg3.party.hp_changed` | `source`, `members[]` |
| Character | `bg3.character.level_up` | `source`, `characterId`, `level` |
| Character | `bg3.character.died` | `source`, `characterId` |
| Character | `bg3.character.revived` | `source`, `characterId` |
| Combat | `bg3.combat.started` | `source`, `encounter` |
| Combat | `bg3.combat.ended` | `source`, `victory`, `roundCount` |
| Combat | `bg3.combat.enemy_killed` | `source`, `enemy`, `byCharacterId?` |
| Dialogue | `bg3.dialogue.started` | `source`, `npc` |
| Dialogue | `bg3.dialogue.choice_made` | `source`, `choice`, `outcome?` |
| Dialogue | `bg3.dialogue.ended` | `source`, `npc` |
| Quest | `bg3.quest.started` | `source`, `quest` |
| Quest | `bg3.quest.updated` | `source`, `quest`, `step` |
| Quest | `bg3.quest.completed` | `source`, `quest` |
| Region | `bg3.region.entered` | `source`, `region` |
| Region | `bg3.region.exited` | `source`, `region` |
| Inventory | `bg3.inventory.item_picked_up` | `source`, `item`, `rarity?` |
| Inventory | `bg3.inventory.item_dropped` | `source`, `item` |
| Inventory | `bg3.inventory.item_used` | `source`, `item` |
| Rest | `bg3.rest.short` | `source` |
| Rest | `bg3.rest.long` | `source`, `camp` |
| Skill | `bg3.skill.check_rolled` | `source`, `skill`, `dc`, `roll`, `success` |
| Skill | `bg3.skill.spell_cast` | `source`, `spell`, `byCharacterId?` |
| Inspiration | `bg3.inspiration.gained` | `source`, `reason?` |

## Source values

`source` is always one of: `bg3se` (real Lua mod), `bg3-mock` (desktop
mock generator), `manual` (manual `curl` or test injection).

## Currently wired

The Phase 10 BG3SE mod wires 14 of the 28 events to real Osiris
listeners (see `docs/integrations/bg3-mod.md`). The remaining 14 are
emitted only by the Phase 9 `MockBg3EventGenerator` for now — Phase 11+
will extend the mod's Osiris coverage as the catalog matures.

## Adding an event

1. Add the Zod schema in `packages/event-catalog/src/index.ts`, plus
   the entry in `CATALOG` and `EVENT_CATEGORIES`.
2. Add the constant in `src/Reyn.Contracts/Events/Bg3EventCatalog.cs`
   and the `Bg3EventTypes.All` list. Optionally add a payload record in
   `Bg3Payloads.cs` if the desktop renders it directly.
3. Add the constant in `apps/reyn-bg3-mod/ScriptExtender/Lua/Catalog.lua`
   and the `Catalog.All` list.
4. If wiring an Osiris listener, add a `Handlers.<name>` pure function
   and a row in `M.Subscriptions` in `BootstrapServer.lua`.
5. Add a bootstrap test that exercises the new handler.

The plan's Phase 11 codegen task is the natural place to remove the
hand-sync requirement.
