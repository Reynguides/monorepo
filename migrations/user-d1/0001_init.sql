-- Reyn per-user D1 — initial schema.
-- Per ADR-0007 (UUIDv7 PK + UNIQUE(user_id, content_hash) dedup) and
-- ADR-0008 (server-wins LWW for mutable aggregates).
--
-- This same template is applied to:
--  - The shared user-data D1 (`reyn_user_data_shared`) when PROVISIONER=shared,
--    where multiple users share one DB and rows are partitioned by user_id.
--  - Each dedicated per-user D1 (`reyn_user_<userId>`) when PROVISIONER=dedicated.
--    The user_id column is still present for shape parity across modes.

CREATE TABLE IF NOT EXISTS events (
    event_id     TEXT PRIMARY KEY,         -- uuidv7 (RFC 9562)
    user_id      TEXT NOT NULL,
    type         TEXT NOT NULL,            -- e.g. "bg3.combat.enemy_killed"
    occurred_at  INTEGER NOT NULL,         -- epoch ms (client-asserted)
    payload_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,            -- sha256(canonical_json(...)) hex
    received_at  INTEGER NOT NULL          -- epoch ms (server-stamped)
);

CREATE UNIQUE INDEX IF NOT EXISTS events_user_content_idx ON events(user_id, content_hash);
CREATE INDEX IF NOT EXISTS events_user_occurred_idx ON events(user_id, occurred_at);

-- Pre-rolled-up daily counters per (user, day, event-type).
-- Updated by the sync push handler. Server-wins LWW via server_updated_at.
CREATE TABLE IF NOT EXISTS event_summaries (
    user_id           TEXT NOT NULL,
    day               TEXT NOT NULL,       -- 'YYYY-MM-DD' UTC
    type              TEXT NOT NULL,
    count             INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, day, type)
);

-- Per-user achievement unlock state. Mutable; server-wins.
CREATE TABLE IF NOT EXISTS achievements_state (
    user_id              TEXT NOT NULL,
    code                 TEXT NOT NULL,     -- catalog identifier
    unlocked             INTEGER NOT NULL DEFAULT 0,  -- 0 = locked, 1 = unlocked
    progress_numerator   INTEGER NOT NULL DEFAULT 0,
    progress_denominator INTEGER NOT NULL DEFAULT 0,
    unlocked_at          INTEGER,
    server_updated_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, code)
);

-- Per-user contiguous play-session windows. Mutable; server-wins.
CREATE TABLE IF NOT EXISTS play_sessions (
    id                TEXT PRIMARY KEY,     -- uuidv7
    user_id           TEXT NOT NULL,
    started_at        INTEGER NOT NULL,
    ended_at          INTEGER,
    event_count       INTEGER NOT NULL DEFAULT 0,
    server_updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS play_sessions_user_started_idx ON play_sessions(user_id, started_at);
