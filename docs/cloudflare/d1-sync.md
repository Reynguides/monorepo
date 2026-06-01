# Per-user D1 sync schema

This page documents the schema applied to every per-user data D1
(production) or the shared D1 (`reyn_user_data_shared`, dev). See
`docs/architecture/sync.md` for the end-to-end pipeline and
`docs/architecture/data-isolation.md` for the multi-D1 model.

## Schema

From `migrations/user-d1/0001_init.sql` + `0002_sync_idempotency.sql`:

```sql
-- Per-event row. UUIDv7 PK + UNIQUE(user_id, content_hash) dedup
-- (ADR-0007). Server-wins reconciliation (ADR-0008) lives on the
-- mutable rollup tables further down.
CREATE TABLE events (
    event_id     TEXT PRIMARY KEY,        -- uuidv7 (RFC 9562)
    user_id      TEXT NOT NULL,
    type         TEXT NOT NULL,           -- e.g. "bg3.combat.enemy_killed"
    occurred_at  INTEGER NOT NULL,        -- epoch ms (client-asserted)
    payload_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,           -- sha256(canonical_json(...)) hex
    received_at  INTEGER NOT NULL         -- epoch ms (server-stamped)
);
CREATE UNIQUE INDEX events_user_content_idx ON events(user_id, content_hash);
CREATE INDEX events_user_occurred_idx        ON events(user_id, occurred_at);

-- Pre-rolled-up daily counters per (user, day, event-type).
-- Written by the sync push handler. Server-wins LWW via server_updated_at.
CREATE TABLE event_summaries (
    user_id           TEXT NOT NULL,
    day               TEXT NOT NULL,       -- 'YYYY-MM-DD' UTC
    type              TEXT NOT NULL,
    count             INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, day, type)
);

-- Per-user achievement unlock state. Mutable; server-wins.
CREATE TABLE achievements_state (
    user_id              TEXT NOT NULL,
    code                 TEXT NOT NULL,
    unlocked             INTEGER NOT NULL DEFAULT 0,
    progress_numerator   INTEGER NOT NULL DEFAULT 0,
    progress_denominator INTEGER NOT NULL DEFAULT 0,
    unlocked_at          INTEGER,
    server_updated_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, code)
);

-- Per-user contiguous play-session windows. Mutable; server-wins.
CREATE TABLE play_sessions (
    id                TEXT PRIMARY KEY,    -- uuidv7
    user_id           TEXT NOT NULL,
    started_at        INTEGER NOT NULL,
    ended_at          INTEGER,
    event_count       INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL
);
CREATE INDEX play_sessions_user_started_idx ON play_sessions(user_id, started_at);

-- Cached push response per (user, Idempotency-Key). Phase 5.
CREATE TABLE sync_idempotency (
    user_id         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_json   TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX sync_idempotency_created_at_idx ON sync_idempotency(created_at);
```

## When migrations get applied

Three paths apply the same statements:

1. **CI / vitest tests** — `applyD1Migrations` in `test/helpers/setup.ts`
   reads both migration files via `readD1Migrations` (`vitest.config.ts`).
2. **Local dev (`wrangler dev`)** — `pnpm exec wrangler d1 migrations
   apply reyn_user_data_shared --local`.
3. **Production (per-user dedicated D1)** — `DedicatedProvisioner` POSTs
   each statement from `USER_D1_INIT_STATEMENTS` (an inline copy of the
   SQL files) to the Cloudflare REST API after creating the database.

When you add a new migration:
- Write `migrations/user-d1/000N_<slug>.sql`.
- Update `USER_D1_INIT_STATEMENTS` in `src/provisioning/user-d1-schema.ts`
  with the new statements so freshly-provisioned per-user D1s get them.
- Apply to the shared D1 (`reyn_user_data_shared`) via MCP or
  `wrangler d1 execute` so it stays consistent with what new users see.
- The Phase 11 deploy workflow applies migrations against the remote
  `reyn_accounts` + `reyn_user_data_shared` on every deploy; per-user
  D1s pick them up at provision time only.

## Push / pull response contract

`POST /v1/sync/push` returns `{ accepted, duplicates }` — the number of
newly-inserted rows and the number silently dedup'd by the
`UNIQUE(user_id, content_hash)` index. The original plan sketched a third
`errors[]` field, but the implemented contract has no per-event error
channel: the whole batch is Zod-validated up front (any malformed event →
`400`), and inserts use `INSERT OR IGNORE`, so every event in an accepted
batch either inserts or is a duplicate. The desktop client
(`HttpEventSyncClient`) reads exactly these two counts.

`GET /v1/sync/pull?since=<rowid>&limit=<n>` returns `{ items, nextCursor }`,
where `nextCursor` is the last row's cursor, or `null` when the page is the
tail (fresh-install rehydration stops when `nextCursor` is `null`).

## Content hash canonicalisation

`computeContentHash(user, type, occurredAt, payloadJson)` produces
`sha256(user\ntype\noccurredAt\npayloadJson)` hex. Newline is illegal
in any of the four fields (UUID, catalog type, integer, JSON), so the
delimiter is safe. Clients must produce stable JSON (preserve key order
or generate it via a known serialiser) — Reyn-desktop uses
`JsonSerializer` defaults; the BG3SE mod uses the alphabetical
key-order encoder in `apps/reyn-bg3-mod/ScriptExtender/Lua/json.lua`.
