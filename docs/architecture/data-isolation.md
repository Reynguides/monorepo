# Data isolation

Reyn ships an **Accounts D1** + **per-user data D1** split (per ADR-0002).
This page explains the model, the trade-offs, and the lookup path
followed by every read/write on the worker.

## The two databases

### Accounts D1 (`reyn_accounts`)

One database, shared across every user. Holds:

```sql
users          (id, email UNIQUE, password_hash, created_at, updated_at)
sessions       (id, user_id FK, token_hash UNIQUE, created_at, expires_at, revoked_at)
user_databases (user_id PK FK, database_id, region, created_at)
```

Wrangler binding: `ACCOUNTS_DB`. UUID is fixed in `wrangler.toml`.

### Per-user data D1 (one per user, or one shared in dev)

Holds the gameplay payload — `events`, `event_summaries`,
`achievements_state`, `play_sessions`, `sync_idempotency`. Each user gets
their own database UUID (production mode = `PROVISIONER=dedicated`) or
shares a single one partitioned by `user_id` column (dev mode =
`PROVISIONER=shared`).

Schema is in `migrations/user-d1/{0001_init,0002_sync_idempotency}.sql`
and inline as `USER_D1_INIT_STATEMENTS` for the dedicated provisioner
to apply against freshly-created databases via the Cloudflare REST API.

## Provisioner modes

| Mode | `IUserDatabaseProvisioner` | `IUserDatabaseClient` | Notes |
|------|---------------------------|----------------------|-------|
| `dedicated` | `DedicatedProvisioner` (Cloudflare REST `POST /d1/database` + migrations) | `RestUserDatabaseClient` (REST `/d1/database/{id}/query`) | Production. Per-user UUID stored in `user_databases.database_id`. |
| `shared` | `SharedProvisioner` (returns the shared D1's UUID for every user) | `SharedUserDatabaseClient` (uses the `USER_DATA_DB` binding) | Local dev / no-creds CI. |
| `mock` | `MockProvisioner` (in-memory `mock-<userId>`) | `MockUserDatabaseClient` (in-memory) | Unit tests. |

The selection happens in `src/provisioning/factory.ts` and
`src/user-data/factory.ts` based on `env.PROVISIONER` — both fail-fast
with `ProvisioningError` / `UserDatabaseClientError` when the required
secrets are missing (CF_API_TOKEN + CF_ACCOUNT_ID for dedicated,
USER_DATA_DB binding for shared).

## Per-request lookup path

Every sync request walks the same path:

1. **Auth middleware** resolves `Authorization: Bearer <token>` to a
   live session row in `ACCOUNTS_DB.sessions` (token_hash =
   `sha256(SESSION_PEPPER || token)`).
2. **`findDatabaseIdForUser`** reads
   `ACCOUNTS_DB.user_databases WHERE user_id = ?` to get the per-user
   D1 UUID.
3. **Factory** builds the right `IUserDatabaseClient` (Rest vs Shared)
   pointing at that UUID.
4. **Handler** invokes the client (insert events, list since cursor,
   read/write idempotency cache).

A `500 user_database_missing` surfaces if step 2 finds no row, which
should only happen during a partial registration failure.

## Why this split

**Isolation**: when a user requests their data be deleted (GDPR /
Roadmap), the desktop drops `auth.bin` and the worker calls
`DELETE /accounts/{id}/d1/database/{db_id}` — one API call deletes
every event row that user ever created. No cross-user `DELETE FROM
events WHERE user_id = ?` scan, no risk of leaving orphan rows.

**Tenant performance**: a heavy user's event stream (say 50k events)
doesn't share a B-tree with every other user; the per-user D1 has its
own page cache and write contention is purely per-user.

**Throughput cost**: Cloudflare's D1 control plane has a ~50 req/s
per-account rate limit on database create. That's plenty for the
single-developer scale we ship at; production scale would move
provisioning to a job queue (see `docs/roadmap.md`).

## Multi-account local install (deferred)

The schemas all carry `user_id` columns even on per-user databases.
This is shape parity across provisioning modes and intentionally also
leaves room for a future multi-account desktop (one machine, two saved
accounts) without a schema change. Phase 11+ work.
