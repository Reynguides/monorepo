# Reyn — repository entry doc

> Reyn is a Baldur's Gate 3 game-companion desktop app: a polished WPF dashboard, a click-through in-game overlay, BG3 Script Extender event ingestion, local SQLite, and idempotent sync to a Cloudflare Worker backed by per-user D1 databases.

This file is the entry point for any new contributor (human or AI) joining the repo. **Read this first, then drill into the ADR or doc page you need.** Most of what looks like a "convention" in this codebase is actually a captured decision in `docs/adr/` — if something seems weird, check the ADR before "fixing" it.

## Status

**Productionization is complete.** All 11 phases of the implementation plan at `C:\Users\Delas\.claude\plans\winget-upgrade-anthropic-claudecode-toasty-dream.md` are merged to `master`. The repo is now in steady-state maintenance + feature mode against `docs/roadmap.md`.

| Phase | Cadence commit message | Status |
|---|---|---|
| 0  | `docs(adr): record 10 architectural decisions for Reyn productionization` | merged |
| 1  | `refactor: restructure into Reyn monorepo with clean architecture layers` | merged |
| 2  | `feat(data): EF Core migrations + proper domain model replacing EnsureCreated` | merged |
| 3  | `feat(worker): Cloudflare Worker with Accounts D1 and PBKDF2 auth` | merged (note: fallback per [ADR-0006](docs/adr/0006-argon2id-via-hash-wasm.md)) |
| 4  | `feat(worker): per-user D1 provisioning via Cloudflare REST API` | merged |
| 5  | `feat(sync): end-to-end idempotent push/pull with outbox + dead-letter` | merged |
| 6  | `feat(desktop): splash, login, registration with DPAPI token storage` | merged |
| 7  | `feat(ui): production dashboard shell with dark/light themes and navigation` | merged |
| 8  | `feat(ui): charts, timeline, achievements, events wired to live local DB` | merged |
| 9  | `feat(ingestion): BG3 game detection + mock + socket source + overlay polish` | merged |
| 10 | `feat(bg3): Script Extender Lua mod scaffold + unit tests` | merged |
| 11 | `chore(ci): CI/CD, coverage gates, full docs, DoD evidence captured` | merged |

## Quickstart

See [`README.md`](README.md) for setup of the desktop app, Cloudflare Worker, and BG3 mod.

## Commands cheat sheet

```powershell
# Build + test everything (.NET)
dotnet build Reyn.sln -warnaserror
dotnet test Reyn.sln --settings tools/coverage/coverlet.runsettings

# Worker
cd apps/reyn-cloud-worker
pnpm install                                  # from root, once
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage

# Knowledge Base worker (BG3-only KB + hybrid search; no LLM)
cd apps/reyn-kb-worker
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage

# BG3 Lua mod
lua apps/reyn-bg3-mod/tests/lua/run.lua

# Generate a coverage HTML report
dotnet tool restore && dotnet tool run reportgenerator `
  -reports:"**/coverage.cobertura.xml" `
  -targetdir:coverage/report `
  -reporttypes:"Html;TextSummary"
```

## Architectural decisions (locked)

Every locked decision lives as a single ADR. ADRs are immutable once accepted — to change one, write a new ADR that supersedes it.

- [ADR-0001 — Rename project to "Reyn" and adopt a monorepo](docs/adr/0001-monorepo-rename-reyn.md)
- [ADR-0002 — Provision a dedicated Cloudflare D1 database per user via the Cloudflare REST API](docs/adr/0002-per-user-d1-via-rest-api.md)
- [ADR-0003 — Ingest BG3 events via a mock generator now and a Script Extender Lua mod scaffold](docs/adr/0003-bg3-ingestion-mock-plus-lua-skeleton.md)
- [ADR-0004 — 95% line coverage flat across the solution, including WPF UI via FlaUI](docs/adr/0004-coverage-95pct-flat-via-flaui.md)
- [ADR-0005 — Delete the Dota 2 GSI, AI hint, and knowledge-base scaffolding](docs/adr/0005-remove-dota2-gsi-and-ai-hint.md)
- [ADR-0006 — Hash passwords with argon2id via `hash-wasm` in the Cloudflare Worker](docs/adr/0006-argon2id-via-hash-wasm.md)
- [ADR-0007 — Identify game events with UUIDv7; dedupe on both `event_id` and `content_hash`](docs/adr/0007-event-id-uuidv7-content-hash-dedup.md)
- [ADR-0008 — On sync conflict, server-wins; clients reconcile by pulling the server row](docs/adr/0008-conflict-policy-server-wins.md)
- [ADR-0009 — Strict TypeScript and strict .NET quality gates enforced in CI](docs/adr/0009-strict-ts-and-net-quality-gates.md)
- [ADR-0010 — CI/CD on GitHub Actions; Worker deploys are `workflow_dispatch` only](docs/adr/0010-ci-cd-github-actions.md)

**Knowledge Base (`apps/reyn-kb-worker`)** — ADRs 0017–0024. (0011–0016 are intentionally reserved for an independent PoC branch to avoid renumbering collisions if branches ever merge.)

- [ADR-0017 — New KB Worker; platform-first + minimal deps; D1 FTS5](docs/adr/0017-knowledge-base-worker-platform-first.md)
- [ADR-0018 — HTMLRewriter content extraction behind a seam](docs/adr/0018-htmlrewriter-content-extraction.md)
- [ADR-0019 — KB data model + relationship taxonomy](docs/adr/0019-kb-data-model-and-relationship-taxonomy.md)
- [ADR-0020 — Table-driven rules engine](docs/adr/0020-table-driven-rules-engine.md)
- [ADR-0021 — `chars/4` token estimate](docs/adr/0021-chars-over-four-tokenization.md)
- [ADR-0022 — Vectorize metadata indexes + namespaces; supersede-in-place](docs/adr/0022-vectorize-metadata-namespaces-supersede.md)
- [ADR-0023 — Hybrid RRF retrieval (search contract, no LLM)](docs/adr/0023-hybrid-rrf-retrieval.md)
- [ADR-0024 — Adopt Crawlee for the ingestion crawler (Node producer, outside the bundle)](docs/adr/0024-adopt-crawlee-ingestion-crawler.md)

## Quality gates (enforced in CI)

`.github/workflows/ci.yml` runs six jobs on every push + PR (to `master` and the `feat/knowledge-base` integration branch):

1. **`dotnet`** (windows-latest) — restore → build `-warnaserror` → test with coverlet → ReportGenerator → **≥95% line / ≥90% branch** floor or the job fails.
2. **`worker`** (ubuntu-latest) — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` — vitest's own thresholds (95/95/95/90) gate the build.
3. **`kb-worker`** (ubuntu-latest) — same gates as `worker`, working-directory `apps/reyn-kb-worker`. The Crawlee crawler (`tools/crawl.ts`) is type-checked + linted but coverage-excluded (it needs live network). See [`docs/kb/`](docs/kb/architecture.md).
4. **`lua`** (ubuntu-latest) — `apt install lua5.1` + `lua5.1 apps/reyn-bg3-mod/tests/lua/run.lua` (30 tests).
5. **`docs`** (ubuntu-latest) — lychee markdown link check + cspell (covers `docs/kb/**` via the recursive `docs/**/*.md` glob).
6. **`secrets-scan`** (ubuntu-latest) — gitleaks against working tree + history.

`.github/workflows/deploy-worker.yml` is `workflow_dispatch`-only per [ADR-0010](docs/adr/0010-ci-cd-github-actions.md). It applies migrations against the remote Accounts D1 + shared user-data D1, pushes the SESSION_PEPPER secret, then runs `wrangler deploy`. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + `SESSION_PEPPER` in the GitHub environment.

`.github/workflows/deploy-kb-worker.yml` is also `workflow_dispatch`-only. It applies `kb-d1` migrations `--remote`, **creates the Vectorize index + 6 metadata indexes before first ingest** (they are not retroactive), pushes `KB_INGEST_KEY`, then `wrangler deploy`s `apps/reyn-kb-worker`. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + `KB_INGEST_KEY`. The one-time D1/R2 bootstrap is in [`docs/kb/operations.md`](docs/kb/operations.md).

## Testing strategy

See [`docs/testing/test-strategy.md`](docs/testing/test-strategy.md) for the full breakdown across .NET (193 tests), worker (110 tests), and Lua mod (30 tests) layers.

Headline numbers (as of Phase 11):

| Layer | Tests | Coverage |
|---|---|---|
| .NET (`Reyn.sln`) | **193** (4 Infrastructure + 115 Application + 50 ViewModels + 24 UI) | enforced ≥95% / ≥90% |
| Worker | **110** (21 test files via vitest-pool-workers) | 97.58% / 92.39% (lines/branches) |
| KB Worker | **170** (33 test files via vitest-pool-workers) | 99.01% / 92.51% (lines/branches) |
| Lua mod | **30** (3 suites: json + transport + bootstrap) | manual smoke checklist |

## Cloudflare local-dev

```bash
cd apps/reyn-cloud-worker
pnpm exec wrangler d1 migrations apply reyn_accounts --local
pnpm exec wrangler d1 migrations apply reyn_user_data_shared --local
pnpm dev    # → http://127.0.0.1:8787
```

Full setup in [`docs/cloudflare/local-development.md`](docs/cloudflare/local-development.md). Production secrets / bootstrap procedure in [`docs/operations/cloudflare-bootstrap.md`](docs/operations/cloudflare-bootstrap.md).

## D1 migration commands

Add a new migration to `migrations/user-d1/` (or `accounts-d1/`):

```bash
# Local
pnpm exec wrangler d1 migrations apply reyn_user_data_shared --local

# Production (via the Deploy Worker workflow only)
# — never run `--remote` from a laptop; use the workflow.
```

When adding a user-D1 migration, also update `USER_D1_INIT_STATEMENTS` in `apps/reyn-cloud-worker/src/provisioning/user-d1-schema.ts` so newly-provisioned per-user databases get the new statements.

## UI verification

UI changes are verified through three layers:
1. **ViewModel tests** (`tests/Reyn.Desktop.ViewModels.Tests`) — pure VM unit tests, no WPF dependency.
2. **FlaUI smoke** (`tests/Reyn.Desktop.UiTests`) — launches the desktop app and asserts on AutomationIds.
3. **Screenshots** (`docs/ui/screenshots/`) — captured by the FlaUI tests as PR-review evidence.

Every interactive control has an `AutomationProperties.AutomationId`; UI tests query by id, never by visual position.

## Definition of done (achieved 2026-05-29)

Phase 11's DoD block from the plan:

- [x] `dotnet build Reyn.sln -warnaserror` — 0/0
- [x] `dotnet test Reyn.sln --settings tools/coverage/coverlet.runsettings` — see test count above
- [x] Line coverage ≥95% on aggregated cobertura — enforced in CI
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` — passes worker thresholds (95/95/95/90)
- [x] `wrangler d1 migrations apply reyn_accounts --local` — applies cleanly
- [x] `wrangler dev --once` — boots and exits 0
- [x] `lua apps/reyn-bg3-mod/tests/lua/run.lua` — 30/30 pass
- [x] markdown link check + cspell pass on `docs/**/*.md`, `CLAUDE.md`, `README.md`
- [x] `yamllint .github/workflows/*.yml` — passes
- [x] All 9 required screenshots exist in `docs/ui/screenshots/`

## Known limitations and non-goals

- BG3 in-game verification of the BG3SE Lua mod is **best-effort and manual** (per [ADR-0003](docs/adr/0003-bg3-ingestion-mock-plus-lua-skeleton.md) — CI cannot run BG3).
- BG3SE Lua doesn't expose TCP sockets natively; the mod uses **file-based transport** (`%LocalAppData%\…\Reyn\bg3-events.jsonl`) consumed by the desktop's `Bg3FileEventSource`. The `Bg3SocketEventSource` remains for external producers and a future native shim. See [`docs/integrations/bg3-mod.md`](docs/integrations/bg3-mod.md).
- The overlay screenshot (`docs/ui/screenshots/overlay-in-game.png`) captures with some desktop bleed-through because the overlay is a transparent layered window and FlaUI uses screen-buffer BitBlt. [Pristine RenderTargetBitmap capture is roadmap work](docs/roadmap.md).
- Per-user D1 throughput is capped by Cloudflare's control-plane rate limit (~50 req/s/account). Acceptable for a single-developer product; a job queue is roadmap work (per [ADR-0002](docs/adr/0002-per-user-d1-via-rest-api.md)).
- The `--skip-auth` and `--demo-mode` CLI flags are **`#if DEBUG`-gated**; release builds strip them entirely (verified via `strings`). They exist so FlaUI navigation tests can exercise the post-auth UI without a live Worker; Phase 11+ work replaces them with a WireMock-backed integration harness.
- No localisation, no OAuth/Steam SSO, no auto-update yet. See [`docs/roadmap.md`](docs/roadmap.md).
- Password hashing uses PBKDF2-SHA-256 (100k iter) — the [ADR-0006](docs/adr/0006-argon2id-via-hash-wasm.md) fallback path. The argon2id-via-hash-wasm option remains opt-in via env var.

## How to continue work safely

If you're picking this up to add a feature or roadmap item:

1. **Read the relevant ADR** before touching cross-cutting code. Most "weird" decisions are intentional.
2. **The 95% coverage floor is real and CI-enforced.** Add tests with the feature; don't lower the gate.
3. **The catalog is hand-mirrored across TS + C# + Lua.** Every addition needs all three. Codegen is on the roadmap.
4. **Phase numbering ended with Phase 11.** Future work is `feat/<short-slug>` branches, no phase prefix.
5. **Re-run the full DoD block before committing** if you've touched the worker, the desktop coverage shape, or the docs.

## Where to look for things

- **Plan (now historical reference)**: `C:\Users\Delas\.claude\plans\winget-upgrade-anthropic-claudecode-toasty-dream.md`
- **ADRs**: `docs/adr/`
- **Architecture overviews**: `docs/architecture/`
- **Cloudflare bootstrap**: `docs/operations/cloudflare-bootstrap.md`
- **Operations runbook**: `docs/operations/runbook.md`
- **BG3 event catalog (source of truth)**: `packages/event-catalog/src/index.ts`
- **Lua mod**: `apps/reyn-bg3-mod/`
- **Knowledge Base worker**: `apps/reyn-kb-worker/` — docs at `docs/kb/` (architecture, api, data-model, rules, retrieval, crawler, operations)
- **KB source catalog (crawler)**: `apps/reyn-kb-worker/src/lib/sources.ts`
- **Roadmap (post-productionization)**: `docs/roadmap.md`
- **Most-recent session handoff**: `.remember/remember.md`
