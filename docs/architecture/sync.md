# Sync pipeline

End-to-end event delivery from BG3 to the per-user Cloudflare D1.

## Stages

```text
   BG3
    │  Osiris event
    ▼
┌──────────────────────────┐
│ BG3SE Lua mod            │  apps/reyn-bg3-mod/
│ Handlers.* → JSONL        │
└──────────────────────────┘
    │  bg3-events.jsonl
    ▼
┌──────────────────────────┐
│ Desktop ingestion         │  Bg3FileEventSource / Bg3SocketEventSource
│ → IGameEventSource        │  / MockBg3EventGenerator
└──────────────────────────┘
    │  IncomingGameEvent
    ▼
┌──────────────────────────┐
│ EF Core SaveChanges       │  + OutboxEnqueuingInterceptor
│   GameEvent +             │  stamps ContentHash, enqueues outbox row
│   SyncOutboxEntry         │  atomically per-event
└──────────────────────────┘
    │  outbox row Pending
    ▼
┌──────────────────────────┐
│ OutboxProcessor           │  hosted BackgroundService
│ (5s poll, 100 batch,      │
│  exp-jitter backoff       │
│  cap 30s, max 10 attempts)│
└──────────────────────────┘
    │  HTTPS POST /v1/sync/push (Idempotency-Key)
    ▼
┌──────────────────────────┐
│ Worker push handler       │
│ - recompute content_hash  │
│ - look up user's D1       │
│ - INSERT OR IGNORE        │
│ - cache idempotency       │
└──────────────────────────┘
    │
    ▼
   Per-user D1 (events table)
```

## Idempotency model (per ADR-0007 + ADR-0008)

- **Event identity** — `event_id` is UUIDv7 (RFC 9562). Time-ordered
  for read locality.
- **Per-user content dedup** — `UNIQUE(user_id, content_hash)` on the
  events table. Identical content (same type + payload + occurred_at +
  user) is impossible to double-insert.
- **Server recomputes hash** — clients can't lie about the dedup key.
- **`INSERT OR IGNORE`** — silently drops duplicate hashes. The push
  handler counts inserted rows (`meta.changes`) vs input length to
  return `{accepted, duplicates}`.
- **Batch-level idempotency** — optional `Idempotency-Key` header
  caches the full response in `sync_idempotency` keyed by
  `(user_id, key)`. A replay returns the cached body without re-running
  inserts. Covers the network-failed-after-200 case.

## Conflict resolution (per ADR-0008)

The worker always wins on mutable rollups (`event_summaries`,
`achievements_state`, `play_sessions`). Clients reconcile by pulling
the server row via `/v1/sync/pull`. There's no client → server merge —
the server's `server_updated_at` is authoritative.

The `events` table is immutable so there's nothing to conflict on
beyond the duplicate suppression already in place.

## Backoff policy (per `BackoffPolicy.cs`)

```text
attempt 1 → uniformly random in [0, 1s]
attempt 2 → uniformly random in [0, 2s]
attempt 3 → uniformly random in [0, 4s]
…
capped at uniformly random in [0, 30s]
max attempts = 10 → DeadLettered
```

Auth failures (401/403) are treated identically to transient (retry +
backoff). The desktop's `OutboxProcessor` doesn't refresh tokens
inside the loop — the Phase 6 token store is the single seam for the
token, and refresh will be wired in Phase 11+ work.

## Sync status surface

`ISyncStatusPublisher` exposes a singleton `SyncSnapshot`:
`(PendingCount, DeadLetteredCount, LastSuccessfulSyncAt, LastError)`.
The dashboard shell's sync badge binds to it via a Dispatcher.Invoke
adapter (`MainShell.xaml.cs`). Clicking the badge navigates to the
Settings page with `FocusSection = "Sync"`.

## Wire format

### `POST /v1/sync/push`

```json
{
  "events": [
    {
      "eventId":     "<uuidv7>",
      "type":        "bg3.combat.enemy_killed",
      "occurredAt":  1700000000000,
      "payloadJson": "{\"source\":\"bg3se\",\"enemy\":\"Goblin\"}"
    }
  ]
}
```

Headers:
- `Authorization: Bearer <session_token>`
- `Idempotency-Key: <ascii_token_max_128>` (optional)

Response:
```json
{ "accepted": 2, "duplicates": 0 }
```

### `GET /v1/sync/pull?since=<rowid>&limit=N`

Cursor pagination ordered by D1 rowid. `nextCursor=null` signals end.
