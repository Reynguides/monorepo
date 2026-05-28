# ADR-0007: Identify game events with UUIDv7; dedupe on both `event_id` and `content_hash`

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The desktop app records BG3 game events locally (in SQLite, via EF Core) and an outbox processor syncs them to the user's dedicated D1 ([[adr-0002-per-user-d1-via-rest-api]]) via `POST /v1/sync/push`. The sync path has three properties we must handle:

1. **At-least-once delivery**. The desktop app may retry a batch the server already accepted (e.g. the response was lost). Inserts on the server side must be idempotent.
2. **Duplicate events from the source**. The BG3SE Lua mod's listener semantics are not perfectly understood; the same Osiris event could fire twice for one in-game occurrence. We do not want two rows for one "Enemy Killed".
3. **Ordering matters for charts and timeline, but is not load-bearing for correctness.** Events have a timestamp; the timeline groups by play-session; small reordering is acceptable.

We need a primary key on `events` that is:
- Globally unique without coordination (the desktop generates it offline).
- Sortable by creation time, so that ordering queries are index-friendly.
- Compact (D1 rows are 1 KB-ish; we don't want 36-byte UUID strings everywhere).

We also need a way to recognise "the same logical event arrived twice with different `event_id`" — which is what happens when the same Osiris listener fires twice and emits two payloads.

## Decision

1. **Event primary key: UUIDv7.** Generated client-side, stored on disk in SQLite and on the wire as the canonical 8-4-4-4-12 hex string. UUIDv7 encodes a 48-bit Unix-millisecond timestamp in its leading bits, so primary-key inserts are append-mostly and B-tree friendly.
2. **Content hash for source-side dedup.** Each event also carries `content_hash = sha256(canonical_json({type, occurred_at_ms, payload}))`. Canonicalisation: sort object keys, drop nulls, normalise numbers to JSON-format strings, UTF-8 encode.
3. **Server schema** (`migrations/user-d1/0001_init.sql`):
   ```sql
   CREATE TABLE events (
     event_id     TEXT PRIMARY KEY,           -- UUIDv7
     user_id      TEXT NOT NULL,
     type         TEXT NOT NULL,
     occurred_at  INTEGER NOT NULL,           -- epoch ms
     payload_json TEXT NOT NULL,
     content_hash TEXT NOT NULL,
     received_at  INTEGER NOT NULL,
     UNIQUE (user_id, content_hash)
   );
   CREATE INDEX events_user_occurred_idx ON events (user_id, occurred_at);
   ```
4. **Server-side write**: `INSERT OR IGNORE INTO events (...) VALUES (...)`. The `OR IGNORE` covers both:
   - Duplicate `event_id` (same row re-uploaded) — primary key conflict.
   - Different `event_id` but same `content_hash` from this user — `UNIQUE(user_id, content_hash)` conflict.
5. **Response shape**: `{ accepted: number, duplicates: number, errors: ClientEventError[] }`. The desktop outbox treats `accepted + duplicates == batch.length` as success and stops retrying that batch.
6. **`Idempotency-Key` header** for whole-batch dedup. The server records seen keys for 24 h in a small lookup table; on a repeat key it returns the recorded response without re-processing. This is layered defence — uniqueness is already enforced row-by-row.

## Consequences

**Positive**
- Append-mostly inserts thanks to UUIDv7's time-prefix.
- Replays are free at the database layer — no application-level dedup state to manage.
- Source-level dedup (`content_hash`) catches Osiris double-fires that the desktop cannot disambiguate from "two real events".
- Pull cursor can use `received_at` ascending — naturally monotonic on the server.

**Negative**
- `content_hash` requires a canonical serialiser on **both** sides (TS and C#). We bake the canonicalisation rule into `packages/event-catalog/` so both stacks share one definition.
- A legitimate event with byte-identical content within the same `user_id` (e.g. identical "rested at camp" twice in the same millisecond) is collapsed. We accept this — clinically identical events are functionally indistinguishable.
- The 24 h idempotency cache adds a row per `Idempotency-Key`. Bounded; cleaned by a cron.

**Neutral**
- UUIDv7 is RFC 9562 (2024). Tooling support is solid in both .NET (`Guid.CreateVersion7()` is .NET 9+; on .NET 8 we use a small library or hand-roll) and TS (`uuid@^9` or `@paralleldrive/cuid2`-style). The implementation choice is a Phase 2 decision; the ADR locks the format, not the library.

## Alternatives considered

- **UUIDv4**. Random; no time-ordering; bad for B-tree insert. Rejected.
- **ULID**. Time-ordered, base32. Functionally similar to UUIDv7. UUIDv7 is the RFC standard; we follow the standard.
- **Server-assigned auto-increment `INTEGER`**. Requires a server round-trip before the desktop can identify an event. Rejected — breaks offline-first.
- **Hash-only identity (`content_hash` is the PK)**. Loses ordering and obscures the per-event timestamp from the index. Rejected.
- **Last-write-wins on `event_id` collision**. Considered but inferior — the first write is the source of truth; a duplicate retry should not overwrite it with a possibly-mutated copy. Server-wins on conflict is covered separately in [[adr-0008-conflict-policy-server-wins]].

## Verification

- Worker Vitest: same `event_id` twice → `accepted:1, duplicates:1`; same `content_hash` twice with different `event_id` → `accepted:1, duplicates:1`.
- Desktop: `OutboxProcessor` replay test — push a batch, simulate a 500 + retry, assert no duplicate rows in the user D1 stub.
- Cross-stack canonicalisation: a known event hashed by TS and by C# produces byte-identical `content_hash`. Locked by a parity test in `tests/canonicalisation/`.

## References

- RFC 9562 (UUIDv7): <https://www.rfc-editor.org/rfc/rfc9562.html>
- [[adr-0008-conflict-policy-server-wins]]
- [[adr-0003-bg3-ingestion-mock-plus-lua-skeleton]] — the catalog where the canonicalisation rule is documented.
