# Local development

How to run the worker locally without hitting the real Cloudflare API.

## Prereqs

- Node 20+ via `.nvmrc` (the repo pins it).
- `pnpm` via `npx --yes pnpm@9.12.0 <cmd>` (per `package.json:packageManager`).
- An optional `.dev.vars` file under `apps/reyn-cloud-worker/` for local
  secrets. Never committed (in `.gitignore`).

## Install

From the repo root:

```bash
pnpm install
```

This installs every workspace package's deps (`apps/reyn-cloud-worker`,
`packages/event-catalog`).

## Apply migrations to the local D1

```bash
cd apps/reyn-cloud-worker
pnpm exec wrangler d1 migrations apply reyn_accounts --local
pnpm exec wrangler d1 migrations apply reyn_user_data_shared --local
```

These create SQLite databases under `.wrangler/state/v3/d1/` and run
every `migrations/{accounts,user}-d1/*.sql` against them. Idempotent.

## Run the worker

```bash
pnpm dev    # alias for `wrangler dev`
```

By default `wrangler dev` binds to `127.0.0.1:8787` and uses the
miniflare-backed local D1. Auth + sync endpoints work end-to-end against
the local database. The `PROVISIONER` variable defaults to `shared`
(set in `wrangler.toml`), so every register reuses the local
`reyn_user_data_shared` D1.

## Smoke test

```bash
# Register a fresh user
curl -X POST http://127.0.0.1:8787/v1/auth/register \
     -H "content-type: application/json" \
     -d '{"email":"a@b.io","password":"Hunter2longenough!"}'

# → {"userId":"...","token":"...","expiresAt":"..."}

# Push an event
TOKEN=…
curl -X POST http://127.0.0.1:8787/v1/sync/push \
     -H "authorization: Bearer $TOKEN" \
     -H "content-type: application/json" \
     -d '{"events":[{"eventId":"<uuid>","type":"bg3.combat.enemy_killed","occurredAt":1700000000000,"payloadJson":"{\"source\":\"manual\",\"enemy\":\"Goblin\"}"}]}'

# → {"accepted":1,"duplicates":0}

# Pull
curl -H "authorization: Bearer $TOKEN" \
     "http://127.0.0.1:8787/v1/sync/pull?limit=10"
```

## Run the test suite

```bash
cd apps/reyn-cloud-worker
pnpm test            # vitest, 110 tests
pnpm test:coverage   # +coverage gate (95/95/95/90)
pnpm typecheck
pnpm lint
pnpm format:check
```

`vitest-pool-workers` v0.8.x is the bridge between vitest and miniflare;
it boots a miniature Workers runtime for each test worker. **D1 bindings
are declared only in `wrangler.toml`** — declaring them in both the
miniflare config and wrangler.toml causes a "Expected object, received
string" pool error (see [[ADR-0010]]).

## Dev secrets

The worker needs `SESSION_PEPPER` to function. Local dev uses a
deterministic value from `vitest.config.ts`. To exercise `wrangler dev`
against the real local D1, create `.dev.vars` with:

```text
SESSION_PEPPER=00000000000000000000000000000000000000000000000000000000000000ff
```

This file is gitignored; never check in real production peppers.

## Cleanup

The `.wrangler/` directory holds local D1 state, KV state, cache files,
etc. Delete it to reset everything:

```bash
rm -rf apps/reyn-cloud-worker/.wrangler
```

The next `pnpm exec wrangler d1 migrations apply ... --local` rebuilds
clean databases.
