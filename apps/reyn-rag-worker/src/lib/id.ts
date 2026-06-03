/**
 * Fresh identifier for a new D1 row.
 *
 * The schema comments call PKs "uuid" and ADR-0007 prefers UUIDv7 (time-ordered)
 * for events. A time-ordered v7 id is a nice-to-have here too, but for the PoC a
 * plain `crypto.randomUUID()` (v4) is acceptable — KB rows are keyed by
 * `(source_id, url)` / `(page_id, url)` for identity (ADR-0016), not by id
 * ordering, so the lack of time-ordering carries no cost. Swap to a v7 generator
 * later without touching callers.
 */
export function newId(): string {
  return crypto.randomUUID();
}
