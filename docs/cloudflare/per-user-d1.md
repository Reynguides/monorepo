# Per-user D1 provisioning

How Reyn allocates one Cloudflare D1 per registered user, per ADR-0002.

## The dance

```text
Desktop                Worker                  Cloudflare control plane
  │                       │                              │
  │  POST /v1/auth/register
  │──────────────────────▶│                              │
  │                       │ ─ INSERT users ───── (D1: reyn_accounts)
  │                       │
  │                       │ ─ provisioner.provision(userId)
  │                       │     │
  │                       │     │ POST /accounts/{id}/d1/database
  │                       │     │   { name: "reyn_user_<short>" }
  │                       │     ├────────────────────────▶│
  │                       │     │◀─── { uuid, region } ───│
  │                       │     │
  │                       │     │ POST /d1/database/{uuid}/query  × N
  │                       │     │   (USER_D1_INIT_STATEMENTS)
  │                       │     ├────────────────────────▶│
  │                       │     │◀─── 200 ────────────────│
  │                       │     │
  │                       │ ◀ ─ UserDatabase { databaseId, region }
  │                       │
  │                       │ ─ INSERT user_databases ─ (D1: reyn_accounts)
  │                       │ ─ INSERT sessions ─────── (D1: reyn_accounts)
  │                       │
  │◀─── 201 {userId, token, expiresAt} ─
  │
```

## REST endpoints used

| Endpoint | Purpose | Min token scope |
|----------|---------|----------------|
| `POST   /accounts/{id}/d1/database` | Create a new per-user D1 | `Account → Cloudflare D1 → Edit` |
| `POST   /d1/database/{db_id}/query` | Apply migrations + run sync queries | same |
| `DELETE /accounts/{id}/d1/database/{db_id}` | Rollback / GDPR delete | same |

The provisioner uses a single Cloudflare API token stored as
`CF_API_TOKEN` (Worker secret) with the account ID in `CF_ACCOUNT_ID`.

## Rollback path

`DedicatedProvisioner.provision` is intentionally non-transactional —
Cloudflare's API doesn't let us atomically "create + initialise +
rollback". If `applyMigrations` throws after the database is created,
we issue a best-effort `DELETE` and surface a `ProvisioningError` to
the register handler, which surfaces 500 to the desktop. Orphaned
empty D1s are rare and visible in the Cloudflare dashboard for manual
cleanup.

A future job-queue-based provisioner (see `docs/roadmap.md`) would
move this into a retryable workflow, but at single-developer scale the
manual reconciliation cost is negligible.

## Throughput

Cloudflare's REST control plane has a documented ~50 req/s/account
rate limit on database create. At expected scale (one developer, low
hundreds of users / year) this is unreachable. If Reyn ever hits the
limit:
- Buffer registrations in a Workers Queue.
- A dedicated worker consumes the queue and provisions in a tight
  serial loop.

## How to test the dedicated path

The integration test in `apps/reyn-cloud-worker/test/provisioning/`
runs against the **mock fetcher** — a stub that returns canned
Cloudflare REST responses. No real D1 is created during CI.

Manual smoke (single-developer machine):

```powershell
cd apps/reyn-cloud-worker
$env:CF_API_TOKEN = "…"
$env:CF_ACCOUNT_ID = "2037a70710ca66abb1b7644b25dcacc1"

# Provisions a real per-user D1 — clean up via the Cloudflare
# dashboard after testing.
pnpm exec wrangler dev --env dedicated
curl -X POST http://127.0.0.1:8787/v1/auth/register \
     -H "content-type: application/json" \
     -d '{"email":"smoke@example.com","password":"Hunter2longenough!"}'

# Verify a new database appeared:
curl -H "Authorization: Bearer $env:CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$env:CF_ACCOUNT_ID/d1/database" \
     | jq '.result[] | select(.name | startswith("reyn_user_"))'
```

Don't forget to delete the test database via the Cloudflare dashboard or
`DELETE /accounts/{id}/d1/database/{db_id}` when finished.
