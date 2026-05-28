# Reyn — repository entry doc

> Reyn is a Baldur's Gate 3 game-companion desktop app: a polished WPF dashboard, a click-through in-game overlay, BG3 Script Extender event ingestion, local SQLite, and idempotent sync to a Cloudflare Worker backed by per-user D1 databases.

This file is the entry point for any new contributor (human or AI) joining the repo. **Read this first, then drill into the ADR or doc page you need.** Most of what looks like a "convention" in this codebase is actually a captured decision in `docs/adr/` — if something seems weird, check the ADR before "fixing" it.

## Status

Productionization is in progress, phase-by-phase, against the implementation plan at `C:\Users\Delas\.claude\plans\winget-upgrade-anthropic-claudecode-toasty-dream.md` (note: the slug is a stale carryover from an earlier unrelated plan; the file itself is the live Reyn plan).

| Phase | What lands | Cadence commit message |
|---|---|---|
| 0 | This file + 10 ADRs | `docs(adr): record 10 architectural decisions for Reyn productionization` |
| 1 | Monorepo restructure; dead Dota code deleted | `refactor: restructure into Reyn monorepo with clean architecture layers` |
| 2 | EF Core migrations replacing `EnsureCreated()` | `feat(data): EF Core migrations + proper domain model replacing EnsureCreated` |
| 3 | Cloudflare Worker + Accounts D1 + argon2id auth | `feat(worker): Cloudflare Worker with Accounts D1 and argon2id auth` |
| 4 | Per-user D1 provisioning via Cloudflare REST | `feat(worker): per-user D1 provisioning via Cloudflare REST API` |
| 5 | Sync push/pull + outbox + dead-letter | `feat(sync): end-to-end idempotent push/pull with outbox + dead-letter` |
| 6 | Splash + login + register + DPAPI tokens | `feat(desktop): splash, login, registration with DPAPI token storage` |
| 7 | Dashboard shell + themes + navigation | `feat(ui): production dashboard shell with dark/light themes and navigation` |
| 8 | Charts, timeline, achievements, events | `feat(ui): charts, timeline, achievements, events wired to live local DB` |
| 9 | BG3 detection + mock + socket source + overlay polish | `feat(ingestion): BG3 game detection + mock + socket source + overlay polish` |
| 10 | BG3SE Lua mod scaffold | `feat(bg3): Script Extender Lua mod scaffold + unit tests` |
| 11 | CI/CD + coverage gates + docs + DoD evidence | `chore(ci): CI/CD, coverage gates, full docs, DoD evidence captured` |

To find the cursor: `git log --oneline` and match against the commit-message column. The first row whose commit is **not** in the log is the next phase.

## Architectural decisions

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

## Operating instructions for AI assistants

When you continue this work in a future session:

1. **Read the plan** at the path above.
2. **Locate the cursor** by matching `git log --oneline` against the cadence table.
3. **Execute the next phase exactly as specified** — its deliverables, its verification block, and the commit message in the table. The plan is the source of truth, not your memory of it.
4. **Do not lower a quality gate** to make a phase pass. If 95% line coverage is unreachable on a sub-layer, add tests. If a strict-type rule is fighting you, refactor — do not silence the rule.
5. **One phase per session is the expected cadence**, unless the user says otherwise. Each phase ends with a commit + a handoff written to `.remember/remember.md`.
6. **If a phase verification fails**, stop and ask. Do not "fix" the verification by relaxing the assertion.

## Where to look for things

- **Plan**: `C:\Users\Delas\.claude\plans\winget-upgrade-anthropic-claudecode-toasty-dream.md`
- **ADRs**: `docs/adr/`
- **Architecture overviews** (Phase 11): `docs/architecture/`
- **Cloudflare bootstrap** (Phase 11): `docs/operations/cloudflare-bootstrap.md`
- **BG3 event catalog** (Phase 9): `packages/event-catalog/src/index.ts`
- **Lua mod scaffold** (Phase 10): `apps/reyn-bg3-mod/`
- **Recent context handoff**: `.remember/remember.md`

## Known limitations and non-goals

- BG3 in-game verification of the BG3SE Lua mod is **best-effort and manual** ([[adr-0003-bg3-ingestion-mock-plus-lua-skeleton]] — CI cannot run BG3).
- Per-user D1 throughput is capped by Cloudflare's control-plane rate limit (~50 req/s/account). Acceptable for a single-developer product; a job queue is roadmap work ([[adr-0002-per-user-d1-via-rest-api]]).
- No localisation, no OAuth/Steam SSO, no auto-update yet. See `docs/roadmap.md` (Phase 11).
