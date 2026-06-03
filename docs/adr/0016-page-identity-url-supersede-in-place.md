# ADR-0016: Key wiki pages by URL and supersede them in place (diverges from ADR-0007)

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

[[adr-0007-event-id-uuidv7-content-hash-dedup]] dedupes **immutable** game events by `content_hash` with `INSERT OR IGNORE` — perfect for append-only data. The RAG KB stores **wiki pages, which mutate**: a page is re-crawled and its content changes over time. Reusing `content_hash` as page *identity* would create a second row for the same URL on every edit, orphan the previous chunks, and leave stale vectors in Vectorize (which has no in-Worker enumeration to find them).

## Decision

**Page identity = `UNIQUE(source_id, url)`.** `content_hash` is a **change-detector**, not identity:

1. On (re-)ingest, compute `content_hash` of the cleaned page text. If it equals the stored hash → **skip re-index** (cheap idempotent no-op).
2. If it differs → **upsert the page row by URL**, then **supersede**: delete the page's existing `chunks` rows and `deleteByIds(...)` their Vectorize vectors (vector ids are tracked authoritatively in the `embedding_state` D1 ledger), then re-chunk, re-embed, and re-upsert.

The KB always reflects the **latest** crawl; **no version history** is retained for the PoC.

## Consequences

**Positive**
- Always-current corpus; safe, idempotent re-crawls; no orphaned vectors.
- The `embedding_state` ledger compensates for Vectorize's lack of a list/scan API.

**Negative**
- History is lost (can't diff or pin an old version) — acceptable for a PoC.
- The delete-then-rebuild path must be correct or stale chunks linger; covered by tests.

**Neutral**
- Deliberately diverges from ADR-0007: the domain is mutable, not append-only. Both patterns coexist in the monorepo for their respective data.

## Alternatives considered

- **`content_hash` as identity (à la ADR-0007).** Rejected — duplicate rows per URL and orphaned vectors on every edit.
- **Full version history.** Deferred — extra storage + retrieval/cleanup complexity; overkill for the PoC.

## Verification

- Re-ingesting an unchanged page is a no-op (`accepted:0`, hash match).
- Editing a page then re-indexing leaves exactly the new chunk set; `GET /v1/kb/verify` reports zero orphans (every `embedding_state.vector_id` resolves, no chunk lacks a vector).

## References

- [[adr-0007-event-id-uuidv7-content-hash-dedup]] — the immutable-event pattern this intentionally diverges from.
- Vectorize client API (no list/scan; `deleteByIds`): <https://developers.cloudflare.com/vectorize/reference/client-api/>
