# ADR-0003: Ingest BG3 events via a mock generator now and a Script Extender Lua mod scaffold

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Baldur's Gate 3 ships **no first-party telemetry hook** — no equivalent of Dota 2's Game State Integration, no `gamestate_integration_*.cfg` HTTP webhook, no public Steam Rich Presence stream beyond presence strings. The only realistic in-game event source is **BG3 Script Extender (BG3SE)**, a community-maintained native runtime that exposes the game's Osiris event bus to Lua scripts loaded as mods.

This creates a dependency we cannot fully control:
- BG3SE is third-party and breaks with most BG3 patches until updated.
- The user's local install may or may not have BG3 + BG3SE + the right mods enabled.
- CI cannot install BG3 (Larian client + Steam licence). We **cannot** end-to-end test through a running game from CI.

The dashboard, charts, timeline, achievements, and event log all need data flowing to be meaningfully built and tested. Waiting on a live BG3 + BG3SE setup before any of that work happens would block 8+ phases of the plan.

## Decision

1. **Two event sources, identical schema, swap by config**:
   - `MockBg3EventGenerator` — a seeded weighted state machine that emits the same JSON shape the real mod will emit. Drives all local development, demo mode, and 95%-coverage tests.
   - `Bg3SocketEventSource` — listens on `127.0.0.1:35353` for newline-delimited JSON pushed from the BG3SE Lua mod over TCP.
2. **Source-of-truth schema** lives in `packages/event-catalog/` (TypeScript). The catalog declares ~30 BG3-shaped event types (lifecycle, party, character, combat, dialogue, quest, region, inventory, rest, skill, inspiration). C# DTOs in `Reyn.Contracts/Events/` are **generated** from the catalog via `pnpm gen:csharp`. The Lua side mirrors a hand-maintained `Catalog.lua` derived from the same source.
3. **BG3SE Lua mod scaffold** ships in `apps/reyn-bg3-mod/`:
   - `meta.lsx` — Larian-format mod metadata.
   - `ScriptExtender/Lua/BootstrapServer.lua` — registers Osiris listeners (`Ext.Osiris.RegisterListener` for events like `CharacterDied`, `LeveledUp`, `EnteredCombat`, `QuestUpdate`, …), serialises to JSON, writes to a TCP socket at `127.0.0.1:35353`.
   - `README.md` — install instructions (`%LocalAppData%\Larian Studios\Baldur's Gate 3\Mods\`).
4. **Lua testability** — Lua mod logic is unit-tested on CI (Ubuntu, `lua5.1`) with a mocked `Ext` table; we assert the JSON payload emitted for each listener invocation.
5. **In-game verification is documented as best-effort and manual**. The runbook (`docs/integrations/bg3-mod.md`) lists the manual checklist; the absence of a real in-game smoke test does not block the Phase 11 Definition-of-Done.

## Consequences

**Positive**
- Every non-Lua phase can be developed and tested without BG3 installed.
- Mock and real source are interchangeable behind `IGameEventSource`, so swapping in the live socket later is a one-line registration change.
- Schema drift between Lua, TS validator, and C# DTO is structurally prevented because all three derive from one catalog file.

**Negative**
- We will discover in-game behaviour mismatches only on real-game manual testing. Some Osiris listener names may turn out to be misnamed or fire under different semantics than the catalog assumes.
- The Lua mod loses its ability to be runtime-tested in CI — only unit tests run. Documented; accepted.
- BG3 patches that break BG3SE break the live event source until the community updates BG3SE. Reyn keeps working in mock mode; the runbook documents the workaround.

**Neutral**
- The TCP socket protocol (newline-delimited JSON on `127.0.0.1:35353`) is intentionally trivial. Named pipes would be slightly more secure but Lua + BG3SE has stronger ecosystem support for sockets. The localhost-only bind is documented; if a future user needs network exposure, that's a separate ADR.

## Alternatives considered

- **Real BG3SE integration first; no mock generator**. Rejected: blocks the entire dashboard/timeline/achievements/overlay phases on a dependency the user may not have set up yet. Mock-first is the standard "stub the boundary" play.
- **Mock-only; defer the Lua mod indefinitely**. Rejected: shipping a companion app for BG3 without any real-game integration would be a vapor product. The Lua scaffold is the seed for real integration, even if its in-game verification is manual.
- **Polling the BG3 log file (`Player.log` or save metadata)**. Considered. Logs are sparse and high-latency; quest-level granularity is poor. Lua via BG3SE has direct access to the Osiris event bus, which is the right primitive.
- **A separate "BG3 ingest agent" process instead of in-app socket listener**. Adds another deployable. The current approach (desktop app listens on a localhost TCP port; mod writes to it) is simpler and one less moving part.

## Verification

- `dotnet test tests/Reyn.Application.Tests --filter FullyQualifiedName~Ingestion /p:Threshold=95` — mock + socket source.
- `lua tests/lua/run.lua` — Lua mod unit tests (CI).
- Manual: `nc 127.0.0.1 35353` and inject a `{"type":"bg3.combat.enemy_killed",...}` payload; observe it in the desktop EventsPage.

## References

- BG3 Script Extender: <https://github.com/Norbyte/bg3se>
- Larian modding wiki: <https://wiki.bg3.community/>
- [[adr-0009-strict-ts-and-net-quality-gates]] — the catalog drives both stacks; both stacks enforce strict typing on the generated artefact.
