# Roadmap

Phase 11 is the final phase of the productionization plan — every item
in this list is **post-productionization** work.

## Knowledge Base (`apps/reyn-kb-worker`)

The BG3 Knowledge Base — a structured KB engine with a typed relationship
graph, an explicit rules layer, and hybrid (semantic + keyword + filtered +
relationship-aware) search — was built on the `feat/knowledge-base` branch
(ADRs 0017–0024, docs at `docs/kb/`). It deliberately stops at **retrieval**;
LLM answer generation is out of scope. Follow-ups:

- **Answer layer (RAG)** — a *consumer* of `POST /v1/kb/search`, not part of
  this worker. The search response is already the citation-ready contract.
- **More sources** — extend `SOURCE_CATALOG` (`src/lib/sources.ts`) beyond
  `bg3-wiki`; a JS-rendered source needs Crawlee's `PlaywrightCrawler`.
- **Richer `page_type` classification** — the crawler ingests everything as
  `article`; a per-source classifier (or a normalize rule) could set finer
  types pre-index.
- **Scheduled re-crawl + freshness** — a cron-triggered crawl so `crawled_at`
  /freshness decay reflects live wiki edits.

## Near-term (1–2 sessions)

- **Catalog codegen** — replace the three-way hand-mirror (TS + C# +
  Lua) with `pnpm gen:csharp` + `pnpm gen:lua` scripts driven off the
  TS source. Today the convention is documented in
  `docs/events/bg3-event-catalog.md#adding-an-event`; the cost of a
  generator is dwarfed by the cost of an out-of-sync addition once the
  catalog grows past ~30 types.
- **Replace `--skip-auth` / `--demo-mode`** with a WireMock-backed
  integration harness. The flags are DEBUG-gated (PR #8) so they're
  not in shipped binaries, but a proper test seam beats CLI flags.
- **Pristine overlay screenshot** — swap FlaUI's screen-buffer capture
  for an in-process `RenderTargetBitmap` driven by a
  `--render-overlay-png <path>` CLI flag. Bypasses the transparent-
  layered-window leak documented in `docs/testing/test-strategy.md`.
- **Bg3 mod: long tail of catalog events** — Phase 10 wired 14 of 28.
  Inventory item_used, dialogue events (started/ended/choice with
  outcome), skill checks (with DC + roll), spell cast, party HP, and
  inspiration gained all need additional Osiris listener arity work
  or BG3 query calls.

## Mid-term (per-feature)

- **Achievement engine DSL** — currently a hand-rolled
  `AchievementCatalog.cs`. A DSL (e.g. JSON rules:
  `kill: { enemy: any, count: 100, in: 24h }`) would let achievement
  state be derived from the event stream without C# changes per
  achievement.
- **Real party HP** in the overlay — wire `bg3.party.hp_changed`
  through the overlay VM. Currently the 4-up rings are mocked.
- **Settings page** — theme toggle (dark/light), overlay on/off,
  telemetry opt-in, account / logout, dead-letter "force retry"
  button.
- **Auto-update** via [Velopack](https://velopack.io) — single-file
  installer with delta updates so users get bug fixes without manual
  re-install.
- **Localization** — currently English-only; the dashboard copy is
  in `CaptionText` style and views — a `Reyn.Desktop.Localization`
  package with resx + a `loc:` markup extension could swap strings.

## Long-term

- **OAuth / Steam SSO** — drop the email+password flow. The worker
  swaps PBKDF2 for an OIDC verifier; the desktop launches a system
  browser. Major refactor of the Phase 6 auth shell.
- **Multi-account local install** — the schemas all carry `user_id`,
  and the per-user D1 design tolerates multiple accounts per machine.
  Wiring the desktop UI for an account switcher is the missing piece.
- **Per-user D1 provisioning at scale** — current implementation
  hits the ~50 req/s control-plane limit on Cloudflare. Move
  provisioning to a Workers Queue + a dedicated consumer if Reyn
  ever sees concurrent registration spikes.
- **Telemetry** — opt-in error reporting to a Cloudflare Worker (no
  third-party SaaS). The Phase 5 outbox is the natural place to
  attach diagnostic event types.
- **Cloud achievements leaderboard** — using the Accounts D1
  cross-user, but only with explicit opt-in. The achievements_state
  table on the user-D1 already has enough to support this; the new
  surface is a separate per-leaderboard aggregate.
- **Web companion view** — a read-only React frontend that talks to
  the same `/v1/sync/pull` endpoint. Reuses the Zod schemas in
  `packages/event-catalog`.

## Won't ship (explicit non-goals)

- **Real-time push from worker → desktop** — would require Durable
  Objects + WebSockets. The 5-second outbox poll is sufficient for a
  game companion.
- **Persistent user data on the desktop only** — the worker D1 is the
  authoritative copy; the local SQLite is a cache. We don't ship a
  "use Reyn offline forever" mode.
- **Modding the BG3 game files** — Reyn is a pure observer via Script
  Extender + Osiris. Never touches save data, character sheets, or
  game balance.
