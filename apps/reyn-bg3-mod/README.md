# Reyn Companion — BG3 Script Extender mod

Forwards Baldur's Gate 3 Osiris events to the Reyn desktop app as
newline-delimited JSON. Production-shape scaffold: 14 high-signal events
wired, JSON serialization tested, transport pluggable. Phase 11 will
wire the desktop's file-watcher source against the file this mod writes.

## Status

This is **Phase 10** of the [Reyn productionization plan](../../docs/adr).
The mod is structured + unit-tested but **real-game verification is
manual** (see *Smoke checklist* below) because CI cannot run BG3 itself.

## Prerequisites

1. **Baldur's Gate 3** installed.
2. **BG3 Script Extender** (BG3SE) installed and attached to your game.
   Setup: <https://github.com/Norbyte/bg3se>.
3. A BG3 mod manager (BG3MM or Vortex) to enable the mod.

## Install

1. Copy the `apps/reyn-bg3-mod` directory contents into:

   ```text
   %LocalAppData%\Larian Studios\Baldur's Gate 3\Mods\ReynCompanion\
   ```

   The folder should contain `meta.lsx` at its root and a
   `ScriptExtender/Lua/` subdirectory.

2. Open your mod manager, refresh the mod list, and enable **Reyn
   Companion**. Save the load order.

3. Launch the game with Script Extender attached. The mod logs a startup
   line to the BG3SE console:

   ```text
   [Reyn] Companion mod loaded — Osiris listeners active.
   ```

## How events get to the desktop

The mod writes newline-delimited JSON to:

```text
%LocalAppData%\Larian Studios\Baldur's Gate 3\Script Extender\Reyn\bg3-events.jsonl
```

Each line is one catalog-shaped event:

```json
{"type":"bg3.combat.enemy_killed","occurredAt":1700000000000,"payload":{"source":"bg3se","enemy":"Goblin Scout"}}
```

The Reyn desktop already speaks newline-delimited JSON via its Phase 9
`Bg3SocketEventSource` (loopback:35353); Phase 11 adds a
`Bg3FileEventSource` watching the path above so this mod can deliver
events without a TCP layer.

### Why file-based instead of TCP

BG3SE Lua doesn't expose raw TCP sockets — there's no `LuaSocket`, no
`Ext.Net.Http` for arbitrary endpoints, and shipping a native DLL into
the sandbox is brittle. File-based delivery is the only realistic
zero-dependency transport. The path is mirrored on the Reyn desktop
side; a future native shim (Phase 11+ roadmap) could bridge the file
into the existing TCP source if a real-time push becomes necessary.

## Wired events

14 high-signal Osiris listeners (Phase 10). The remaining 14 catalog
types are deferred to Phase 11 — they need extra arity work or BG3
query calls.

| Osiris event             | Catalog type                 |
|--------------------------|------------------------------|
| `CharacterDied`          | `bg3.character.died`         |
| `CharacterResurrected`   | `bg3.character.revived`      |
| `LeveledUp`              | `bg3.character.level_up`     |
| `CombatStarted`          | `bg3.combat.started`         |
| `CombatEnded`            | `bg3.combat.ended`           |
| `RegionStarted`          | `bg3.region.entered`         |
| `RegionEnded`            | `bg3.region.exited`          |
| `QuestStarted`           | `bg3.quest.started`          |
| `QuestUpdated`           | `bg3.quest.started`          |
| `QuestComplete`          | `bg3.quest.completed`        |
| `LongRestRequested`      | `bg3.rest.long`              |
| `ItemPickedUp`           | `bg3.combat.enemy_killed` *  |
| `RealtimeLoaded`         | `bg3.session.started`        |
| `GameOver`               | `bg3.session.ended`          |

*`ItemPickedUp` is wired to a placeholder handler pending the Phase 11
inventory pipeline.

## Smoke checklist (manual, requires BG3 + BG3SE)

1. Install per the steps above. Enable the mod. Save load order.
2. Launch BG3 with Script Extender attached.
3. Confirm the BG3SE console shows
   `[Reyn] Companion mod loaded — Osiris listeners active.`
4. Start or load a save. Confirm `%LocalAppData%\…\Reyn\bg3-events.jsonl`
   is created and contains at least one
   `{"type":"bg3.session.started",...}` line.
5. Engage in a combat encounter. After at least one enemy dies, the
   file should grow with `bg3.character.died` (and/or other combat)
   entries.
6. Quit BG3. The file should contain a `bg3.session.ended` line.
7. (Optional, Phase 11+) Open the Reyn desktop and confirm the events
   appear on the Events page within ~2 seconds of the file write.

## Unit tests

Pure Lua, no BG3 required. The harness stubs `Ext` so the entire
module is testable without the Script Extender runtime.

```powershell
cd apps/reyn-bg3-mod
lua tests/lua/run.lua
```

Expected output:

```text
29 passed / 29 total — 0 failures
```

Compatible with Lua 5.1 (BG3SE's runtime) and 5.4 (dev / CI). The Phase
11 CI job will install `lua5.1` and run the same command.

## File map

```text
apps/reyn-bg3-mod/
├── meta.lsx                              # BG3 mod metadata + UUID
├── README.md                             # this file
├── ScriptExtender/Lua/
│   ├── init.lua                          # BG3SE entry point
│   ├── BootstrapServer.lua               # Osiris listener registration + emit pipeline
│   ├── Catalog.lua                       # Catalog event-type constants (mirrors packages/event-catalog)
│   ├── json.lua                          # tiny pure-Lua encoder (tests don't depend on Ext.Json)
│   └── transport.lua                     # buffered Ext.IO.AppendFile transport
└── tests/lua/
    ├── helpers.lua                       # minimal assert + Ext stub harness
    ├── json_test.lua                     # JSON encoder
    ├── transport_test.lua                # buffering + flush behavior
    ├── bootstrap_test.lua                # handler shape + subscription registration
    └── run.lua                           # entry runner — `lua tests/lua/run.lua`
```
