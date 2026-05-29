-- Reyn per-user D1 — sync idempotency cache.
-- Phase 5: the /v1/sync/push handler honors the `Idempotency-Key` header by
-- recording the response body once, keyed by (user, key). A duplicate request
-- (e.g. the client crashed mid-response and replayed the same batch) returns
-- the cached response instead of re-processing. Per-event INSERT OR IGNORE on
-- `events` would also achieve dedupe at the row level, but the cached batch
-- response avoids the client having to recompute "what was new vs duplicate".

CREATE TABLE IF NOT EXISTS sync_idempotency (
    user_id         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_json   TEXT NOT NULL,           -- cached PushResponse body
    created_at      INTEGER NOT NULL,        -- epoch ms; future job can GC stale keys
    PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sync_idempotency_created_at_idx
    ON sync_idempotency(created_at);
