# ADR-0001: Rename project to "Reyn" and adopt a monorepo

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The repository started as `Overlay-in-game-WPF`, a 3-commit POC built around a single WPF .NET 8 project. The original concept (a transparent click-through overlay for **Dota 2** with a Game State Integration listener and a Gemini-based hint engine) was abandoned mid-prototype: the GSI server, AI hint service, and knowledge base are present but commented out in `MainWindow.xaml.cs`.

We are pivoting the product to a **Baldur's Gate 3 (BG3) game-companion desktop app**: login + dashboard + timeline + achievements + a polished in-game overlay, with event ingestion from BG3 (mock now, BG3 Script Extender Lua mod scaffold later), local SQLite, and idempotent sync to a Cloudflare Worker backed by **real per-user D1 databases**.

This pivot requires more than renaming a csproj: we now need a desktop app + a Cloudflare Worker + a shared TypeScript event-catalog package + a BG3 Lua mod, plus shared docs, shared CI, and cross-stack tests. Keeping them in separate repositories would force cross-repo PR coordination for every schema change (BG3 event added → TS catalog updated → C# DTO regenerated → Worker validator regenerated → desktop ingester updated → all four merged together). That is the textbook case for a monorepo.

## Decision

1. The product is renamed **Reyn**. All new namespaces use `Reyn.*` (e.g. `Reyn.Domain`, `Reyn.Application`, `Reyn.Infrastructure`, `Reyn.Contracts`, `Reyn.Desktop`).
2. The repository becomes a **monorepo** rooted at the existing directory, organized as:
   - `apps/reyn-desktop/` — WPF .NET 8 desktop app (successor of `Overlay-in-game-WPF.csproj`).
   - `apps/reyn-cloud-worker/` — Cloudflare Worker (Wrangler 4 + Hono + Zod).
   - `apps/reyn-bg3-mod/` — BG3 Script Extender Lua mod scaffold.
   - `packages/event-catalog/` — shared TypeScript event-type catalog; C# DTOs generated from it.
   - `packages/shared-types/` — request/response DTOs mirrored on both sides.
   - `src/Reyn.{Domain,Application,Infrastructure,Contracts}/` — .NET libraries shared by the desktop app and (eventually) any future .NET services.
   - `tests/` — every .NET test project.
   - `migrations/` — D1 SQL migrations (Accounts D1 + per-user D1 template).
   - `docs/`, `tools/`, `.github/workflows/`.
3. .NET projects live in **one solution** (`Reyn.sln`) at repo root. TypeScript packages live in a **pnpm workspace** rooted at the repo (`pnpm-workspace.yaml`).
4. Build hygiene: `Directory.Build.props` (Nullable, warnings-as-errors, analyzers), `Directory.Packages.props` (Central Package Management), `global.json` (pin .NET 8 SDK), `.nvmrc` (Node 20, for Workers parity).

## Consequences

**Positive**
- A schema change ships in a single PR that touches the TS catalog, the C# DTO output, the Worker validator, and the desktop ingester atomically. CI runs all four together.
- One CI pipeline gates both stacks. Coverage thresholds are enforced uniformly.
- One issue tracker, one set of ADRs, one CLAUDE.md. New contributors have a single entry point.
- Renaming to `Reyn` decouples the codebase from its dead-on-arrival Dota 2 origin and is a one-time tax.

**Negative**
- Larger working copy; git operations are marginally slower than the current ~6-file POC.
- Tooling (lint, test, build) must understand both .NET and Node toolchains. We accept this in exchange for the schema-coupling win.
- New contributors need both .NET 8 SDK and Node 20 + pnpm installed locally. Documented in `README.md` / `docs/operations/runbook.md`.

**Neutral**
- The existing remote Worker at `https://syncworker.oleksandr-delas.workers.dev` is treated as **legacy** and superseded by `apps/reyn-cloud-worker/`. Deletion of the old deploy is documented in `docs/operations/cloudflare-bootstrap.md`.

## Alternatives considered

- **Two separate repositories (`reyn-desktop`, `reyn-cloud`)**. Rejected: every schema change becomes a coordinated cross-repo PR pair, and version drift between the C# DTO and the TS validator is the most likely class of runtime bug we can build into the product.
- **Keep the name `Overlay-in-game-WPF`**. Rejected: the name actively misleads — there is no Dota overlay, and the WPF tail is one of four runtime targets (WPF, Workers, Lua, generated TS). The name should describe the product, not the first prototype's stack.
- **`src/` instead of `apps/` + `packages/`**. Rejected: this repo has multiple deployable artifacts (desktop app, Worker, mod). The `apps/` + `packages/` split is the de-facto pnpm/Nx convention for that shape and makes the artifact boundary visible at the directory level.

## Verification

After Phase 1 (monorepo restructure) lands:
- `Reyn.sln` builds with `dotnet build -warnaserror`.
- `pnpm install` at repo root populates `node_modules` for every workspace listed in `pnpm-workspace.yaml`.
- No file references the old `Overlay_in_game_WPF` namespace outside `obj/` build artifacts (which are gitignored).

## References

- [[adr-0005-remove-dota2-gsi-and-ai-hint]] — the dead-code cleanup unblocked by the rename.
- Plan `winget-upgrade-anthropic-claudecode-toasty-dream.md`, "Target monorepo layout" section.
