/**
 * Inline copy of `migrations/user-d1/0001_init.sql` for the DedicatedProvisioner
 * to apply via Cloudflare REST API after creating a new D1.
 *
 * Kept in sync with the .sql file by convention; a Phase 11 build step could
 * generate this from the file at build time. For now, edit both together
 * when the schema changes.
 */
export const USER_D1_INIT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS events (
    event_id     TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    type         TEXT NOT NULL,
    occurred_at  INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    received_at  INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_user_content_idx ON events(user_id, content_hash)`,
  `CREATE INDEX IF NOT EXISTS events_user_occurred_idx ON events(user_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS event_summaries (
    user_id           TEXT NOT NULL,
    day               TEXT NOT NULL,
    type              TEXT NOT NULL,
    count             INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, day, type)
  )`,
  `CREATE TABLE IF NOT EXISTS achievements_state (
    user_id              TEXT NOT NULL,
    code                 TEXT NOT NULL,
    unlocked             INTEGER NOT NULL DEFAULT 0,
    progress_numerator   INTEGER NOT NULL DEFAULT 0,
    progress_denominator INTEGER NOT NULL DEFAULT 0,
    unlocked_at          INTEGER,
    server_updated_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS play_sessions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    started_at        INTEGER NOT NULL,
    ended_at          INTEGER,
    event_count       INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS play_sessions_user_started_idx ON play_sessions(user_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS sync_idempotency (
    user_id         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_json   TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (user_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS sync_idempotency_created_at_idx ON sync_idempotency(created_at)`,
];
