# Roadmap

Phase 11 is the final phase of the productionization plan — every item
in this list is **post-productionization** work.

## PoC 2 — RAG infrastructure (implemented)

A Cloudflare-hosted RAG knowledge base for a BG3 wiki, built as a new
isolated worker `apps/reyn-rag-worker` (D1 + R2 + Vectorize + Workers AI,
with OpenRouter generation via AI Gateway). It crawls BG3 wiki sources,
stores raw + cleaned content and images, embeds and indexes them, and
serves a retrieval-augmented query/answer API with source citations. The
consuming "universal game wiki" website is **out of scope**. Decisions are
captured in ADRs 0011–0016; the worker mirrors `reyn-cloud-worker`'s
conventions and 95% coverage gate. OpenRouter is opt-in (`LLM_PROVIDER=mock`
by default) so the bulk of the work builds and tests with zero external
credits. All phases (0–7) are implemented on branch `feat/poc2-rag-infra`.

**PoC 2 follow-up items:**

- **Query endpoint rate limiting** — `POST /v1/rag/query` has no rate
  limiting in this release. Add a Cloudflare WAF rate-limit rule before
  any public exposure to prevent cost and DoS exposure on the live
  OpenRouter path (see `docs/rag/operations.md#known-limitations`).
- **Productization licensing rework** — the current corpus includes
  Fextralife (ToS violation risk, owner-accepted for the PoC). Before
  any public deployment, supersede [[ADR-0015]]: drop Fextralife,
  restrict to bg3.wiki CC-BY-SA (post-2024-07-20) with ShareAlike
  compliance, and treat community guides as cite-by-link only.
- **Embedding model comparison runs** — Vectorize dimensions are fixed at
  creation, so each candidate model needs its own index. Compare
  `@cf/baai/bge-base-en-v1.5` (768-dim, current default) against BGE
  small/large/`bge-m3` and optionally OpenAI `text-embedding-3-small`
  (1536-dim, via AI Gateway). Record results in `docs/rag/tuning.md`.
- **BG3SE-style live verification** — the crawler runs manually against
  the live wiki; add a scheduled Cloudflare Cron Trigger (or a GitHub
  Actions schedule) to refresh the corpus on a regular cadence and post
  a verification summary.

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
