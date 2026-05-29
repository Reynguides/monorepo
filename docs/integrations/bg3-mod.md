# BG3 Script Extender mod integration

The mod skeleton lives at `apps/reyn-bg3-mod/`. This page is the
integration guide for how it talks to the rest of the system. See
`apps/reyn-bg3-mod/README.md` for the install + smoke-test checklist.

## Where the events go

```text
BG3                          Mod                              Desktop
 │                            │                                │
 │ Osiris event               │                                │
 ▼                            │                                │
 ───────────────▶  Handlers.<event>(now, ...)                  │
                       │                                       │
                       │  catalog-shaped table                 │
                       ▼                                       │
                  transport.send(json.encode(event))           │
                       │                                       │
                       │  Ext.IO.AppendFile                    │
                       ▼                                       │
              %LocalAppData%\…\Reyn\bg3-events.jsonl  ──watch─▶ Bg3FileEventSource
                                                                │
                                                                ▼
                                                          IGameEventSource
                                                                ▼
                                                       EF SaveChanges + outbox
                                                                ▼
                                                          OutboxProcessor → /v1/sync/push
```

## Transport details

BG3SE Lua doesn't expose TCP sockets natively. The mod writes
newline-delimited JSON to a JSONL file:

- **Path** — `%LocalAppData%\Larian Studios\Baldur's Gate 3\Script
  Extender\Reyn\bg3-events.jsonl`. The path is relative
  (`Reyn/bg3-events.jsonl`) per BG3SE's `Ext.IO.AppendFile` API which
  rebases against the SE data directory.
- **Batching** — `transport.lua` buffers up to 16 lines or 2 seconds,
  whichever comes first, then writes once. Keeps the file write rate
  low without latency surprises.
- **Format** — one JSON object per line; alphabetical key order via
  `json.lua` for deterministic test comparisons.

The desktop side is the `Bg3FileEventSource` introduced in Phase 11.
Its companion `Bg3SocketEventSource` (Phase 9) remains live for
external producers (`nc` testing, future native shim) on
`127.0.0.1:35353`.

## Wired Osiris events

Phase 10 ships 14 listeners. The Subscriptions list in
`BootstrapServer.lua` is the canonical source.

| Osiris listener         | Arity | Maps to catalog               |
|-------------------------|-------|-------------------------------|
| `CharacterDied`         | 2     | `bg3.character.died`          |
| `CharacterResurrected`  | 1     | `bg3.character.revived`       |
| `LeveledUp`             | 1     | `bg3.character.level_up`      |
| `CombatStarted`         | 1     | `bg3.combat.started`          |
| `CombatEnded`           | 1     | `bg3.combat.ended`            |
| `RegionStarted`         | 1     | `bg3.region.entered`          |
| `RegionEnded`           | 1     | `bg3.region.exited`           |
| `QuestStarted`          | 1     | `bg3.quest.started`           |
| `QuestUpdated`          | 2     | `bg3.quest.started`           |
| `QuestComplete`         | 1     | `bg3.quest.completed`         |
| `LongRestRequested`     | 0     | `bg3.rest.long`               |
| `ItemPickedUp`          | 2     | (placeholder; Phase 11 work)  |
| `RealtimeLoaded`        | 0     | `bg3.session.started`         |
| `GameOver`              | 0     | `bg3.session.ended`           |

## Testing without BG3

The Lua test harness stubs the `Ext` table so handlers + adapter run
under a bare `lua` interpreter. Run it from the repo root:

```bash
lua apps/reyn-bg3-mod/tests/lua/run.lua
# → 29 passed / 29 total — 0 failures
```

The CI job `lua` does the same with `lua5.1` on Ubuntu.

## Manual in-game verification

Tracked in `apps/reyn-bg3-mod/README.md` *Smoke checklist*. Reproduced
here for cross-link convenience:

1. Install the mod into `%LocalAppData%\…\Mods\ReynCompanion\`.
2. Launch BG3 with BG3SE attached.
3. Confirm the BG3SE console emits `[Reyn] Companion mod loaded — Osiris listeners active.`.
4. Start / load a save → confirm `…\Reyn\bg3-events.jsonl` is created
   and contains a `bg3.session.started` line.
5. Kill an enemy → confirm a `bg3.character.died` line appears.
6. Quit BG3 → confirm a `bg3.session.ended` line appears.
7. Open the Reyn desktop → confirm the events appear on the Events
   page within ~2 seconds of the file write.

The `lua` CI job protects step 1-3's correctness; the rest is
inherently a manual verification step because CI can't run BG3.
