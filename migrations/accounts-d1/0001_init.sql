-- Reyn Accounts D1 — initial schema.
-- Per ADR-0002: single shared D1 that holds identity + the user→database map.

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,            -- uuid (server-generated)
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                -- PHC-style argon2id string (ADR-0006)
    created_at    INTEGER NOT NULL,             -- epoch ms
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,               -- uuid
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,           -- sha256(SESSION_PEPPER || token), hex
    created_at  INTEGER NOT NULL,               -- epoch ms
    expires_at  INTEGER NOT NULL,               -- epoch ms
    revoked_at  INTEGER,                        -- nullable; non-null = logged out
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx  ON sessions(token_hash);

-- The user→dedicated-D1 map. Per ADR-0002 this row is created by the
-- DedicatedProvisioner after `POST /accounts/{id}/d1/database`. Phase 3
-- ships the table; Phase 4 populates it.
CREATE TABLE IF NOT EXISTS user_databases (
    user_id     TEXT NOT NULL PRIMARY KEY,
    database_id TEXT NOT NULL,                  -- Cloudflare D1 database UUID
    region      TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
