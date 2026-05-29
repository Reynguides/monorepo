# Cloudflare bootstrap

How to set up the Cloudflare resources Reyn's Worker depends on, the API
tokens it needs, and the secrets to push.

## Resources

Two Cloudflare D1 databases. Both live under the developer's account
(`Oleksandr.delas@fulcrum.rocks's Account`, `2037a70710ca66abb1b7644b25dcacc1`).

| Name | UUID | Region | Purpose |
|---|---|---|---|
| `reyn_accounts` | `66c23739-91b7-483b-85fc-dd02ff0bf9d9` | WEUR | Shared Accounts D1 — `users`, `sessions`, `user_databases`. Bound as `ACCOUNTS_DB`. |
| `reyn_user_data_shared` | `57512cd4-c5f3-46ff-9b9a-20aedf03a5d7` | EEUR | Shared user-data D1 used in `PROVISIONER=shared` mode. Bound as `USER_DATA_DB`. Unused in `PROVISIONER=dedicated`. |

A pre-existing `my-sync-db` (`4464bbe0-17cf-4a9e-b9aa-cef7769b1d59`) is
**legacy** from the abandoned syncworker — leave it alone for now, plan to
delete it in Phase 11 when the old deploy is retired.

### Migrations

Live migrations are at `migrations/accounts-d1/` and `migrations/user-d1/`.
Apply with `wrangler`:

```powershell
cd apps/reyn-cloud-worker
pnpm exec wrangler d1 migrations apply reyn_accounts --remote
pnpm exec wrangler d1 migrations apply reyn_user_data_shared --remote
```

Phase 3 + 4 applied the initial schemas via the Cloudflare MCP at
build-out time, so the remote D1s already match `0001_init.sql`. Future
schema changes go through `wrangler` (or a new migration file + apply).

## Secrets (`wrangler secret put`)

All secrets are deployed via:

```powershell
cd apps/reyn-cloud-worker
pnpm exec wrangler secret put <NAME>
# (pastes the value at the prompt; never echoed to disk)
```

| Secret | Required for | Notes |
|---|---|---|
| `SESSION_PEPPER` | All modes | 32+ random bytes hex. Re-rotating it invalidates every existing session — only do so deliberately. Generate with `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`. |
| `CF_API_TOKEN` | `PROVISIONER=dedicated` | Account-scoped Cloudflare API token. See "API token scopes" below. |
| `CF_ACCOUNT_ID` | `PROVISIONER=dedicated` | `2037a70710ca66abb1b7644b25dcacc1` for this account. |

`SESSION_PEPPER` is mandatory; the Worker returns `500 server_misconfigured`
without it. `CF_API_TOKEN` + `CF_ACCOUNT_ID` are validated lazily at
register-time; in `PROVISIONER=shared` they are unused.

## API token scopes

Create `CF_API_TOKEN` at <https://dash.cloudflare.com/profile/api-tokens>
using "Create Custom Token" with the **minimum** scopes:

- **Account** → **Cloudflare D1** → **Edit**

Bind the token to the single account you intend to deploy to (the
`2037a707…1` account). Do NOT include `User → User Details → Read` or any
other resource — Phase 4 only calls these endpoints:

- `POST /accounts/{id}/d1/database` (create)
- `POST /d1/database/{db_id}/query` (run SQL)
- `DELETE /accounts/{id}/d1/database/{db_id}` (rollback)

All three are covered by "Cloudflare D1: Edit". Rotate the token every
90 days; revoke immediately if it leaks.

## Deployment

Phase 3 ships the Worker locally only. Phase 11 will add the
`workflow_dispatch`-only deploy workflow (per ADR-0010). To deploy
manually before then:

```powershell
cd apps/reyn-cloud-worker
pnpm exec wrangler login                  # browser flow, one-time
pnpm exec wrangler secret put SESSION_PEPPER
pnpm exec wrangler deploy
```

`wrangler deploy` reads `wrangler.toml`, links the bound D1s, and uploads
the Worker bundle.

## Rate limits to remember

- Cloudflare D1 control-plane API (`POST /d1/database`): **~50 req/s per
  account**. Acceptable for a single-user product; documented as a
  scale-out risk in `docs/roadmap.md`.
- D1 query API (`POST /d1/database/{db_id}/query`): per-database limits
  measured in millions of reads/writes per day on the free tier — well
  inside the working envelope.

## Cleaning up (account teardown)

If you ever need to remove the Reyn footprint:

```powershell
pnpm exec wrangler d1 delete reyn_accounts
pnpm exec wrangler d1 delete reyn_user_data_shared
pnpm exec wrangler secret delete SESSION_PEPPER
pnpm exec wrangler secret delete CF_API_TOKEN  # only if set
pnpm exec wrangler secret delete CF_ACCOUNT_ID # only if set
pnpm exec wrangler delete                       # the Worker itself
```

Plus revoke the API token in the dashboard.
