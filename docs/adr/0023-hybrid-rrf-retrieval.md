# ADR-0023: Hybrid retrieval — RRF over semantic + keyword, the search API is the consumer contract (no LLM)

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The prior PoC searched semantic-only: embed the query, `Vectorize.query`, return the
top chunks. That misses three things a mature KB needs: (1) **exact-term recall** —
a query for a proper noun, a stat, or a rare keyword (`"Karlach"`, `"1d6"`) is
where lexical search beats embeddings; (2) **structured scoping** — restrict by page
type, source tier, language, lifecycle, freshness; (3) **graph awareness** — surface
the prerequisite/related page, not just the single best chunk. We already write
Vectorize metadata + namespaces (ADR-0022), a D1 FTS5 BM25 index (ADR-0019), and a
typed `page_edges` graph (ADR-0019), but nothing consumed them on the query side.

Separately: this worker's scope ends at **retrieval**. LLM answer generation (RAG
chat) is explicitly out — a *future consumer* of this search API. The response shape
is therefore the contract that consumer codes against.

## Decision

`POST /v1/kb/search` (open read, Zod-validated) runs a four-stage hybrid pipeline:

1. **Two arms, run by `mode`** (`hybrid` | `semantic` | `keyword`):
   - *Semantic* — embed the query → `vector.query(vec, { topK, filter, namespace })`.
     A single-`pageType` filter also sets `namespace = pageType` (ADR-0022) to scope
     the search space before metadata filtering.
   - *Keyword* — sanitize the query to alphanumeric terms → `chunks_fts MATCH …
     ORDER BY bm25()`. The candidate pool for each arm is `topK × 3`.
2. **Reciprocal Rank Fusion** (`lib/fusion.ts`, pure): `score(id) = Σ_arms 1/(k+rank)`,
   `k = 60`. RRF fuses by **rank position**, not raw score — cosine similarity
   (≈0–1) and BM25 (unbounded, lower = better) live on incomparable scales, so
   normalizing magnitudes is meaningless; only the ordering each arm produces is
   trustworthy. An id ranked highly by *both* arms wins.
3. **Hydrate + structured re-rank.** Fused chunk ids → `chunks` + `pages` + a source
   → tier map. A post-fusion `rowPasses` guard applies the same structured filters in
   code (the keyword arm has no metadata filter), then `tierBoost` (authoritative
   sources nudged up) and `freshnessScore` (exponential crawl-age decay) are computed.
   Final order = `fused + tier` descending; the top `topK` are kept.
4. **Optional depth-1 relationship expansion** (`expand: true`). For each primary
   result, walk its outgoing `page_edges` of the requested types (default
   `prerequisite | see_also | part_of`), de-duplicated against already-returned pages,
   and append the destination's first chunk **labelled `via: "relationship"`**.
   Dangling or unindexed targets are dropped.

Every result surfaces all sub-scores (`semantic`, `keyword`, `fused`, `tier`,
`freshness`) and provenance (`url`, `headingPath`, `pageType`, `sourceTier`, `via`).
**There is no `answer` field — and never will be in this worker.**

## Consequences

**Positive**
- Lexical + semantic recall, structured filtering, namespace scoping, and graph
  expansion are all first-class — the gaps the PoC was criticized for are closed.
- RRF needs no score calibration between arms and is pure/deterministic → unit-tested
  in isolation; the mock vector index models metadata + namespace filtering so the
  whole pipeline is testable offline with zero external calls.
- A future RAG/answer layer consumes a stable, fully-scored, citation-ready contract.

**Negative**
- The keyword arm can't push structured filters into FTS5 cheaply, so filtering is a
  post-hydration code guard (`rowPasses`) — correct, but it fetches a slightly larger
  candidate pool than strictly needed.
- Relationship expansion is depth-1 and fetches the destination's *first* chunk only
  (a representative, not the best-matching chunk for that page) — deliberate, to keep
  expansion cheap and bounded.

**Neutral**
- `topK × 3` candidate factor and `k = 60` are tunable constants, documented in
  `docs/kb/retrieval.md`.

## Verification

- `fusion.test.ts` — single-list `1/(k+rank)`, cross-arm summation, dual-arm boost,
  custom `k`, empty input.
- `scoring.test.ts` — tier boost monotonicity + floor; freshness half-life decay +
  future-time clamp.
- `search-filters.test.ts` — each filter field → its Vectorize operator, the
  single-`pageType` namespace shortcut, and the `rowPasses` code predicate.
- `vector.test.ts` — the mock index honours `$in`/`$lte`/`$gte`/equality + namespace;
  the Vectorize client forwards `filter`/`namespace`/`returnMetadata`.
- `kb-search.test.ts` — end-to-end hybrid / keyword-only / semantic-only; page-type +
  tier filtering; namespace-scoped typed query; relationship expansion (and dropping
  dangling/unindexed targets); empty result; **no `answer` field**; 400 on empty query.

## References

- [[adr-0022-vectorize-metadata-namespaces-supersede]] — the metadata + namespaces
  this query side consumes.
- [[adr-0019-kb-data-model-and-relationship-taxonomy]] — `chunks_fts` (BM25) + the
  `page_edges` graph used for expansion.
- The Knowledge Base implementation plan (Phase 7).
