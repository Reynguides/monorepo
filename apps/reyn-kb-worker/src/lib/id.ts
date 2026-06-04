/**
 * Fresh identifier for a new D1 row. KB rows are keyed by `(source_id, url)` /
 * `(page_id, url)` for identity (ADR-0019), not by id ordering, so a plain
 * `crypto.randomUUID()` (v4) is sufficient. Swap to a v7 generator later without
 * touching callers.
 */
export function newId(): string {
  return crypto.randomUUID();
}
