# ADR-0022: Vectorize metadata + namespaces; supersede-in-place indexing

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Indexing turns a stored page into chunk vectors. Two questions: (1) how do we make
structured/filtered search (by source tier, page type, freshness, …) possible
server-side, and (2) how do we re-index a changed page without leaving orphaned
vectors (Vectorize cannot be enumerated in-Worker — only `query`/`getByIds`/
`upsert`/`deleteByIds`).

## Decision

1. **Every chunk vector carries metadata + a namespace.** Metadata:
   `{ page_id, chunk_id, url, source_id, source_tier, page_type, lifecycle,
   language, crawled_at, heading_path }`. **Namespace = `page_type`** (e.g. `spell`,
   `item`), so a typed query restricts the search space before metadata filtering
   (P7). The deploy bootstrap creates the Vectorize index with metadata indexes for
   the filterable fields (`source_tier`, `page_type`, `lifecycle`, `language`,
   `source_id`, `crawled_at`) — under the 10-index cap — **before first ingest**
   (metadata indexes are not retroactive).
2. **Supersede-in-place on (re-)index.** Before writing the new chunk set, the
   index handler: reads the page's vector ids from the `embedding_state` ledger →
   `deleteByIds` them in Vectorize → deletes the ledger rows → deletes the old
   `chunks` (the FTS triggers clean `chunks_fts`). Then it extracts → sections →
   chunks → embeds → upserts vectors → writes chunks + ledger. The ledger is the
   authoritative chunk→vector map that makes deletion possible without enumeration.
3. **Chunk identity** = `{pageId}:{ord}`, reused across re-indexes; the embedding
   ledger records `(chunk_id, model, vector_id, namespace)`.

## Consequences

**Positive**
- Structured/filtered + namespace-scoped search becomes possible server-side (P7),
  not an in-code post-filter.
- Re-indexing is deterministic and orphan-free: the new chunk set fully replaces the
  old; dropped ordinals are removed from D1, FTS, the ledger, and Vectorize.

**Negative**
- Metadata indexes must exist before first ingest (not retroactive) → a bootstrap
  ordering constraint, handled in the deploy workflow + ops docs.
- Vectorize metadata string values are indexed on the first 64 bytes; the indexed
  fields (`page_type`/`lifecycle`/`language`/`source_id`) are short — fine.

**Neutral**
- Carries forward the immutable-page / supersede stance from the prior worker; no
  page version history is retained (a counter only).

## Verification

- `kb-index.test.ts`: a fresh index writes chunks + ledger + vectors (with
  `page_type` metadata) + FTS rows + sections + cleaned markdown; a re-index with
  shorter content drops the surplus chunk ordinal from **both** the vector index and
  the ledger (orphan-free); 404 unknown page; 409 page with no stored HTML; a page
  with no extractable blocks yields 0 chunks but still writes markdown.

## References

- [[adr-0019-kb-data-model-and-relationship-taxonomy]] — the `embedding_state`
  ledger + `chunks_fts`.
- [[adr-0023-hybrid-rrf-retrieval]] — the query side that consumes the metadata +
  namespaces.
- The Knowledge Base implementation plan (Phase 5).
