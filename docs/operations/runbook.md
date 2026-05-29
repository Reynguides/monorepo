# Operations runbook

A short cookbook of recovery + diagnostic procedures. For first-time
setup see `cloudflare-bootstrap.md`.

## "The desktop can't sync — what now?"

1. Open the dashboard → click the sync badge → check `LastError`.
   Common values:
   - `Network problem.` → check internet, retry happens automatically.
   - `Invalid credentials.` → token expired or revoked; user has to
     log in again. Clear `%LocalAppData%\Reyn\auth.bin` to force the
     splash → AuthShell route.
2. If the badge shows a growing `PendingCount` but no error, the
   worker is reachable but slow. Inspect with:
   ```bash
   curl https://reyn-cloud-worker.workers.dev/v1/health
   ```
3. For dead-lettered rows (badge shows `DeadLetteredCount > 0`):
   Phase 11 will add a settings UI to reset attempts. Until then:
   ```sql
   UPDATE sync_outbox
      SET Status = 0, Attempts = 0, NextAttemptAt = NULL
    WHERE Status = 2;
   ```
   Run against `reyn-desktop.db` in the desktop project's bin folder.

## "The worker is rejecting register with 500 server_misconfigured"

The factory fails fast when secrets are missing. In production:

```bash
cd apps/reyn-cloud-worker
pnpm exec wrangler secret list

# Should include: SESSION_PEPPER, CF_API_TOKEN, CF_ACCOUNT_ID
# Missing? Re-push:
echo "$NEW_PEPPER" | pnpm exec wrangler secret put SESSION_PEPPER
```

`CF_API_TOKEN` needs `Account → Cloudflare D1 → Edit` at minimum.

## "A user wants their data deleted"

1. Find their `database_id`:
   ```sql
   SELECT database_id FROM user_databases WHERE user_id = '<userId>';
   ```
   (run against `reyn_accounts` via `wrangler d1 execute --remote`)
2. Delete the per-user D1 via Cloudflare REST:
   ```bash
   curl -X DELETE \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/<database_id>"
   ```
3. Cascade-delete the Accounts D1 rows:
   ```sql
   DELETE FROM users WHERE id = '<userId>';
   -- sessions + user_databases cascade via FK ON DELETE CASCADE.
   ```

## "How do I roll out a worker change?"

1. Push to master via PR. CI must pass.
2. Trigger **Deploy Worker** workflow from the Actions tab; choose
   `production`. Inputs are workflow-dispatch only — no auto-deploy on
   push (per ADR-0010).
3. The workflow applies any pending migrations against
   `reyn_accounts` + `reyn_user_data_shared` (idempotent), then runs
   `wrangler deploy`.
4. Smoke-test `/v1/health` from a different network.

## "A desktop sync hammered the worker — how do I see what happened?"

The worker logs via `wrangler tail`:

```bash
cd apps/reyn-cloud-worker
pnpm exec wrangler tail
```

For historical request data, the Cloudflare dashboard's Logs panel
exposes the last 7 days when the worker is on the paid plan; without
it, only `tail` works.

## "How do I bump the catalog?"

See `docs/events/bg3-event-catalog.md#adding-an-event`. The Lua mod
side needs a corresponding handler + subscription wired in
`BootstrapServer.lua` — failing to do so will pass tests but emit
nothing in-game for the new type.
