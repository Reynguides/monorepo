# ADR-0002: Provision a dedicated Cloudflare D1 database per user via the Cloudflare REST API

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Reyn syncs each user's BG3 event stream from the desktop app into Cloudflare. Two realistic data-isolation models exist:

1. **Shared D1, row-level partitioning** — one D1 database; every row carries a `user_id`; every query filters `WHERE user_id = ?`.
2. **Dedicated D1 per user** — at registration, a brand-new D1 database is created for the user; queries against it cannot possibly leak to another user because the database does not contain other users' rows at all.

The user has explicitly asked for **real per-user D1** provisioning. Reasons documented in conversation: hard tenant isolation, per-user export/wipe is trivial (just delete the DB), and the per-user data volume is small enough that the D1 free tier covers it for the foreseeable future.

Cloudflare's static Worker D1 bindings (`[[d1_databases]]` in `wrangler.toml`) cannot bind a database whose ID is discovered at runtime — bindings are resolved at deploy time. So per-user D1 *as a binding* is not available; we must talk to per-user D1s **via the Cloudflare REST API** at request time:
- `POST /accounts/{account_id}/d1/database` — create
- `POST /accounts/{account_id}/d1/database/{database_id}/query` — execute SQL
- `DELETE /accounts/{account_id}/d1/database/{database_id}` — drop (for account-deletion flow)

These calls require an account-scoped API token (`CF_API_TOKEN`) with the `Account → Cloudflare D1 → Edit` permission. The Worker stores this token via `wrangler secret put CF_API_TOKEN`.

## Decision

1. **Accounts D1** (`reyn_accounts`) — a single, statically bound D1 database that holds `users`, `sessions`, and `user_databases (user_id, database_id, region, created_at)`. The mapping `user_id → database_id` is the authoritative source for resolving which dedicated D1 to query for a given user.
2. **Per-user D1** — on the first successful `POST /v1/auth/register`, the Worker calls the Cloudflare REST API to:
   1. `POST /d1/database` with `{ name: "reyn_user_{user_id}" }`.
   2. Apply `migrations/user-d1/0001_init.sql` against the new database via `/d1/database/{db_id}/query`.
   3. Insert a row into `user_databases` mapping the user to the new database ID.
3. **Query path** — for any subsequent request that touches user-owned data (`/v1/sync/push`, `/v1/sync/pull`, etc.), the Worker:
   1. Authenticates the session, recovers the `user_id`.
   2. Looks up the `database_id` from `user_databases`.
   3. Issues `POST /d1/database/{db_id}/query` with the parameterised SQL and `CF_API_TOKEN`.
4. **Implementation surface** — the choice is hidden behind `IUserDatabaseProvisioner` and the matching read interface; three concrete implementations:
   - `DedicatedProvisioner` (production, real REST API).
   - `SharedProvisioner` (local dev / no-credentials CI fallback — single D1, `user_id` partition).
   - `MockProvisioner` (in-memory, for unit tests).
   Selection is by `env.PROVISIONER` (`dedicated|shared|mock`).

## Consequences

**Positive**
- Hard data isolation per user. A SQL bug that forgets a `WHERE user_id = ?` clause cannot cross tenants because the database itself is a different database.
- "Forget me" is one REST call: `DELETE /d1/database/{db_id}` + delete the `user_databases` row. No background `DELETE FROM events WHERE user_id = ?` sweep needed.
- Local dev still works without a Cloudflare account thanks to `SharedProvisioner`.

**Negative**
- Latency: every user-data query is an HTTP round-trip to `api.cloudflare.com` from the Worker, instead of a sub-millisecond native binding call. Documented in `docs/cloudflare/per-user-d1.md`. Mitigations: keep query batches large, use D1's batch API to amortise per-call overhead.
- **Rate limits**: Cloudflare's D1 control-plane API caps creates at ~**50 req/s per account**. For a single-developer / small-user product this is irrelevant. At scale this becomes a queue. Documented as a roadmap item.
- **Partial-failure rollback**: if database creation succeeds but the migration query fails, we have an orphaned empty D1. The provisioner attempts a best-effort `DELETE`; if that also fails, the orphan is logged and listed for manual cleanup. We do **not** retry indefinitely — the registration call returns 500 with a correlation ID.
- Requires `CF_API_TOKEN` to be present and correctly scoped. `wrangler deploy` CI job fails fast if it is missing.

**Neutral**
- The shared `reyn_accounts` D1 is still a SPOF — losing it loses the user→database mapping. Standard D1 backup/restore policy applies. Captured in `docs/operations/runbook.md`.

## Alternatives considered

- **One shared D1 with row-level `user_id` partition**. Simpler, faster (native binding), and the standard pattern for SaaS. Rejected per explicit user requirement for hard isolation. Retained as `SharedProvisioner` for local dev so the team is not blocked by missing Cloudflare credentials.
- **D1 sessions + Worker dynamic bindings**. Not currently a supported feature; dynamic bindings are roadmap, not GA. Cannot ship on it.
- **Durable Objects per user**. DOs are isolated by name, but they are not a relational store — we would lose SQL, schema migrations, and ad-hoc analytics. Rejected.
- **Postgres / Neon / D1-via-Hyperdrive**. Adds infra and a second connection model. The plan is to stay on Cloudflare-native primitives only.

## Verification

- Local: `PROVISIONER=shared pnpm test` exercises the shared partition path end-to-end.
- Mocked: `PROVISIONER=mock pnpm test` exercises every code path that talks to `IUserDatabaseProvisioner`.
- Integration (gated by `CF_INTEGRATION=true`): `PROVISIONER=dedicated pnpm test -- provisioning.integration` actually creates a throwaway D1 in the configured account and tears it down.

## References

- Cloudflare D1 REST API: <https://developers.cloudflare.com/api/operations/cloudflare-d1-create-database>
- [[adr-0008-conflict-policy-server-wins]] — server-wins is cheaper to implement when every user has their own DB (no cross-tenant lock contention).
- Plan section "Cloudflare provisioning model".
