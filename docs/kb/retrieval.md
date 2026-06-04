# Reyn Knowledge Base — retrieval

`POST /v1/kb/search` is the KB's retrieval contract ([ADR-0023](../adr/0023-hybrid-rrf-retrieval.md)).
It is **hybrid**: lexical + semantic recall, structured filtering, namespace scoping, and
optional relationship-graph expansion. It returns ranked chunks with every sub-score
exposed — and **no `answer` field**. LLM answer generation is out of scope; this API is what
a future answer layer would consume.

## Pipeline

1. **Two arms**, selected by `mode` (`hybrid` | `semantic` | `keyword`):
   - **Semantic** — embed the query (`bge-base`) → `Vectorize.query(vec, { topK, filter,
     namespace })`. A single-`pageType` filter also sets `namespace = pageType`
     ([ADR-0022](../adr/0022-vectorize-metadata-namespaces-supersede.md)) to scope the search
     space before metadata filtering.
   - **Keyword** — sanitize the query to alphanumeric terms → `chunks_fts MATCH … ORDER BY
     bm25()` (D1 FTS5).
   - Each arm pulls `topK × CANDIDATE_FACTOR` (=3) candidates.
2. **Reciprocal Rank Fusion** (`src/lib/fusion.ts`): `score(id) = Σ_arms 1/(k + rank)`,
   `k = RRF_K = 60`. Fusing by **rank** (not raw score) is what makes a cosine similarity
   (≈0–1) and a BM25 score (unbounded, lower = better) combinable — their magnitudes are on
   incomparable scales; only the ordering each arm produces is trustworthy.
3. **Hydrate + structured re-rank**: fused chunk ids → `chunks` + `pages` + a source→tier
   map. The same structured filters are re-applied in code (`rowPasses`) — the keyword arm
   has no metadata filter — then `tierBoost` (authoritative sources nudged up) and
   `freshnessScore` (exponential crawl-age decay, 90-day half-life) are computed. Final order
   = `fused + tier` descending; top `topK` kept.
4. **Optional depth-1 relationship expansion** (`expand:true`): for each primary result, walk
   its outgoing `page_edges` of the requested types (default `prerequisite | see_also |
   part_of`), de-duplicated against already-returned pages, and append the destination's first
   chunk **labelled `via:"relationship"`**. Dangling/unindexed targets are dropped.

## Filters

`filters` maps to Vectorize metadata operators (semantic arm) and to a code predicate
(keyword arm + final guard):

| Filter | Operator | Field |
|---|---|---|
| `pageTypes` | `$in` (+ namespace if exactly one) | `page_type` |
| `tiersMax` | `$lte` | `source_tier` |
| `language` | equality | `language` |
| `lifecycle` | equality | `lifecycle` |
| `freshnessAfter` | `$gte` | `crawled_at` |

## Tunable constants

| Constant | Value | Where |
|---|---|---|
| `RRF_K` | 60 | `src/lib/fusion.ts` |
| `CANDIDATE_FACTOR` | 3 | `src/handlers/kb/search.ts` |
| Freshness half-life | 90 days | `src/handlers/kb/search.ts` |
| `tierBoost` | `0.05 / tier` | `src/lib/scoring.ts` |
| Default expand edges | `prerequisite, see_also, part_of` | `src/handlers/kb/search.ts` |

## Result shape

```jsonc
{
  "query": "fire damage",
  "mode": "hybrid",
  "results": [
    {
      "chunkId": "…:0", "pageId": "…", "url": "https://bg3.wiki/wiki/Fireball",
      "title": "Fireball", "headingPath": "Fireball", "pageType": "spell",
      "sourceTier": 1, "snippet": "…",
      "scores": { "semantic": 0.81, "keyword": -3.2, "fused": 0.031, "tier": 0.05, "freshness": 0.97 },
      "via": "primary"
    }
  ]
}
```

`scores.semantic` / `scores.keyword` are `null` when that arm didn't run (mode-specific or
no hit). There is intentionally **no `answer`**.
