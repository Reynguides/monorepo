# Reyn

Reyn is a Baldur's Gate 3 companion app: a polished WPF dashboard, a
click-through in-game overlay, BG3 Script Extender event ingestion,
local SQLite, and idempotent sync to a Cloudflare Worker backed by
per-user D1 databases.

Start with [`CLAUDE.md`](./CLAUDE.md) for the architectural map and the
list of [10 ADRs](./docs/adr/) that record locked decisions.

## Quickstart

### Desktop (Windows)

```powershell
# From the repo root
dotnet restore Reyn.sln
dotnet build Reyn.sln -warnaserror

# Run with seeded demo data + overlay forced visible
dotnet run --project apps/reyn-desktop -- --skip-auth --demo-mode
```

The `--skip-auth` and `--demo-mode` flags are **`#if DEBUG`-gated**;
release builds strip them entirely. Without flags, the app shows the
splash, then either AuthShell (cold start) or MainShell (live session).

### Worker (any OS)

```bash
pnpm install                                   # from repo root
cd apps/reyn-cloud-worker

pnpm exec wrangler d1 migrations apply reyn_accounts --local
pnpm exec wrangler d1 migrations apply reyn_user_data_shared --local

pnpm dev                                       # http://127.0.0.1:8787
```

Smoke:

```bash
curl -X POST http://127.0.0.1:8787/v1/auth/register \
     -H "content-type: application/json" \
     -d '{"email":"a@b.io","password":"Hunter2longenough!"}'
```

### BG3 mod (Windows, with BG3 + BG3SE installed)

```text
copy apps\reyn-bg3-mod   →   %LocalAppData%\Larian Studios\Baldur's Gate 3\Mods\ReynCompanion\
```

Then enable **Reyn Companion** in your mod manager and launch BG3.
Events stream to `%LocalAppData%\…\Reyn\bg3-events.jsonl`.

See `apps/reyn-bg3-mod/README.md` for the full install + smoke
checklist.

## Test

```powershell
# .NET (193 tests)
dotnet test Reyn.sln

# Worker (110 tests)
cd apps/reyn-cloud-worker
pnpm test

# Lua mod (30 tests)
lua apps/reyn-bg3-mod/tests/lua/run.lua
```

All three layers are gated in CI (`.github/workflows/ci.yml`) at
**≥95% line coverage / ≥90% branch coverage**. The gate is enforced,
never lowered — if a sub-layer can't meet it, add tests (per ADR-0004).

## Docs

| Topic | Path |
|-------|------|
| Architectural decisions | [`docs/adr/`](./docs/adr) (10 ADRs) |
| Architecture overview | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| Monorepo layout | [`docs/architecture/monorepo.md`](./docs/architecture/monorepo.md) |
| Data isolation (Accounts + per-user D1) | [`docs/architecture/data-isolation.md`](./docs/architecture/data-isolation.md) |
| Sync pipeline | [`docs/architecture/sync.md`](./docs/architecture/sync.md) |
| Auth + Accounts D1 schema | [`docs/cloudflare/accounts-api.md`](./docs/cloudflare/accounts-api.md) |
| User-data D1 schema | [`docs/cloudflare/d1-sync.md`](./docs/cloudflare/d1-sync.md) |
| Wrangler local-dev setup | [`docs/cloudflare/local-development.md`](./docs/cloudflare/local-development.md) |
| Per-user D1 provisioning | [`docs/cloudflare/per-user-d1.md`](./docs/cloudflare/per-user-d1.md) |
| BG3 event catalog | [`docs/events/bg3-event-catalog.md`](./docs/events/bg3-event-catalog.md) |
| BG3 mod integration | [`docs/integrations/bg3-mod.md`](./docs/integrations/bg3-mod.md) |
| Test strategy + 95% gate | [`docs/testing/test-strategy.md`](./docs/testing/test-strategy.md) |
| Code quality rules | [`docs/quality/code-quality-rules.md`](./docs/quality/code-quality-rules.md) |
| UI design direction | [`docs/ui/game-ui-direction.md`](./docs/ui/game-ui-direction.md) |
| Operations runbook | [`docs/operations/runbook.md`](./docs/operations/runbook.md) |
| Cloudflare bootstrap | [`docs/operations/cloudflare-bootstrap.md`](./docs/operations/cloudflare-bootstrap.md) |
| Roadmap (post-productionization) | [`docs/roadmap.md`](./docs/roadmap.md) |
| UI screenshots | [`docs/ui/screenshots/`](./docs/ui/screenshots) |

## License

Internal project; no public license. See `CLAUDE.md` for contribution
guidelines.
