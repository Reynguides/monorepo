# Accounts API + D1 schema

## Endpoints

All endpoints accept and return JSON. Errors use the uniform envelope:

```json
{ "error": "validation_failed", "message": "…", "issues": [...] }
```

### `POST /v1/auth/register`

Body:
```json
{ "email": "u@example.com", "password": "12+chars-password" }
```

| Code | Body | When |
|------|------|------|
| 201  | `{userId, token, expiresAt}` | success — token is the bearer for subsequent requests |
| 400  | `{error: "validation_failed", issues}` | Zod failed (short pw, bad email) |
| 409  | `{error: "email_already_exists"}` | UNIQUE constraint on `users.email` |
| 500  | `{error: "server_misconfigured", message}` | missing `SESSION_PEPPER` or provisioner creds |

Side effects:
- Insert into `users`
- Provisioner creates a per-user D1 (in `dedicated` mode) and applies the
  user-d1 schema
- Insert into `user_databases`
- Issue a session row

### `POST /v1/auth/login`

Body identical to register. Returns 200 + AuthResponse on success;
401 `invalid_credentials` otherwise.

### `POST /v1/auth/logout`

Bearer-auth required. Marks the session's `revoked_at`. Returns 204.

### `GET /v1/me`

Bearer-auth required. Returns `{userId, email}` (200) or `401`.
Desktop calls this on cold start to verify a stored token before
landing on MainShell.

### Health

`GET /v1/health` → `{ ok: true, time: "ISO-8601" }`.

## Schema (Accounts D1)

From `migrations/accounts-d1/0001_init.sql`:

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,              -- uuid v4
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                  -- PBKDF2-SHA-256 PHC (Phase 3 fallback per ADR-0006)
    created_at    INTEGER NOT NULL,               -- epoch ms
    updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,                 -- uuid v4
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,             -- sha256(SESSION_PEPPER || token), hex
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    revoked_at  INTEGER,                          -- non-null = logged out
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_id_idx     ON sessions(user_id);
CREATE INDEX sessions_token_hash_idx  ON sessions(token_hash);

CREATE TABLE user_databases (
    user_id     TEXT NOT NULL PRIMARY KEY,
    database_id TEXT NOT NULL,                    -- Cloudflare D1 UUID
    region      TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Auth invariants

- **Password hashing**: PBKDF2-SHA-256 with PHC-style salt encoding;
  the Phase 3 fallback from ADR-0006 (argon2id via hash-wasm couldn't
  ship cleanly under the Worker size budget at the time).
- **Token storage**: never store the raw bearer; the database holds
  `sha256(SESSION_PEPPER || token)`. The pepper is a `wrangler secret
  put`-provided 32+ random hex bytes.
- **Session lifetime**: 30 days (`SESSION_TTL_MS = 30 * 24 * 60 * 60 *
  1000`). The desktop reads `expiresAt` from the stored DPAPI blob and
  short-circuits to AuthShell before the network call.

See `docs/cloudflare/local-development.md` for wrangler dev setup and
`docs/operations/cloudflare-bootstrap.md` for production secrets.
