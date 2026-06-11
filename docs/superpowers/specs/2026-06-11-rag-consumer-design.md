# RAG Consumer Worker — design spec

**Date:** 2026-06-11
**Branch:** `feat/rag-consumer` (off `master`)
**Status:** approved-by-decisions (4 choices locked with the owner); build autonomous, mock-only.

## Goal

Implement the deferred **RAG answer-generation** layer (initial-plan Phase 5) + the **eval harness** (Phase 6) as a **new, thin consumer worker** that sits on top of the existing KB worker's hybrid search API. LLM generation was deliberately excluded from `apps/reyn-kb-worker` (ADR-0017/0023); this worker adds it without contaminating the KB engine.

See memory `rag-generation-and-eval-deferred` for the backstory. Reference implementation (to port, not import): branch `feat/poc2-rag-infra`, `apps/reyn-rag-worker`.

## Locked decisions

| # | Decision |
|---|---|
| Model | Default `OPENROUTER_MODEL=google/gemma-4-31b-it:free` ($0, rate-limited). Config value only; never called during the build. |
| Scope | `POST /v1/rag/query` answer endpoint **+** eval harness (golden set + pure metrics). |
| Topology | **New separate worker** `apps/reyn-rag-worker`, calling the KB worker's `POST /v1/kb/search` over HTTP. |
| This run | **Mock-only.** `LLM_PROVIDER=mock`, `KB_SEARCH=mock` by default. Zero external calls, $0, no secrets. Live OpenRouter + Cloudflare AI Gateway + deploy are a separate owner-triggered step. |

## Architecture — a pure HTTP-orchestration worker (no Cloudflare resource bindings)

Because `/v1/kb/search` already does embedding + Vectorize + D1 FTS + RRF + tier/freshness re-rank internally, the consumer needs **no `AI`, `VECTORIZE`, `KB_DB`, or `R2` bindings** — only env vars + an outbound HTTP call. This is the core simplification over the PoC (which embedded and searched itself).

```
POST /v1/rag/query  { question, topK?, filters? }              (open read)
  → KbSearchClient.search({ query: question, topK, mode:"hybrid", filters })   [HTTP → KB worker]
  → drop unusable results, dedupe citations by chunkId (search already tier+fused-ranked)
  → assembleContext(results.map(r => r.snippet), CONTEXT_MAX_CHARS)            [ported, pure]
  → LlmProvider.generate({ system, prompt, temperature })   ← Mock by default; OpenRouter opt-in
  → scores: relevance / confidence / freshness                                 [ported, pure]
  → RagQueryResponse.parse({ answer, citations[], scores })  → 200
empty retrieval → 200 with a fixed "no context" answer + zeroed scores
```

### Components

- **`vector`→ replaced by `kb-search/` seam (NEW)** — `IKbSearchClient.search(req): Promise<KbSearchResult[]>`.
  - `HttpKbSearchClient({ baseUrl, fetcher })` — POSTs to `${KB_BASE_URL}/v1/kb/search`, parses the response with a Zod schema mirroring the KB worker's result shape. `fetcher` constructor-injected (stub in tests → counts toward coverage, never hits network).
  - `MockKbSearchClient` — returns canned, deterministic results so the whole pipeline runs offline.
  - `factory.ts` switches on `env.KB_SEARCH` (`mock` | `http`); `http` fail-fasts if `KB_BASE_URL` is unset.
- **`llm/` seam (PORTED verbatim)** — `types`, `factory` (switch on `LLM_PROVIDER`), `MockLlmProvider`, `OpenRouterLlmProvider` (via Cloudflare AI Gateway, injected fetcher).
- **`lib/` pure (PORTED)** — `context-assembly.ts`, `scoring.ts` (`relevanceScore`, `confidenceScore`, `freshnessScore`), `errors.ts` (lifted from kb-worker), `eval-metrics.ts`.
  - **Not ported:** `rerank.ts` (KB search already re-ranks by `fused+tier`), the embedding/vector/store seams, all `repo/*`, all D1.
- **`schemas/rag.ts` (PORTED + extended)** — request gains optional `filters` (passed through to KB search); response unchanged (`answer`, `citations[]`, `scores`).
- **`handlers/rag/query.ts` (REWIRED)** — same skeleton as the PoC handler, but retrieval = `KbSearchClient.search(...)` instead of embed+vector+DB; context from `snippet`; citations from result `url`/`sourceTier`/`chunkId`.
- **`handlers/health.ts` + `index.ts`** — Hono app, `GET /v1/health`, `POST /v1/rag/query`.
- **`eval/` (PORTED)** — `golden.json` (BG3 Q/A), `run.ts` (thin CLI hitting a live worker; coverage-excluded), metrics in `lib/eval-metrics.ts` (coverage-gated + unit-tested).

### Scoring mapping (PoC → consumer)

| Signal | PoC source | Consumer source |
|---|---|---|
| relevance | mean of cosine match scores | `relevanceScore(results.map(r => r.scores.semantic).filter(non-null))` |
| confidence | fraction of cosine ≥ 0.5 | `confidenceScore(sameSemanticScores, 0.5)` |
| freshness | `freshnessScore(citedCrawlTimes, now, 90d)` | `max(results.map(r => r.scores.freshness))` (KB search already computed per-result freshness; no crawl times exposed) |

## KB search contract this worker bridges

Request (subset used): `{ query, topK, mode:"hybrid", filters?: { pageTypes?, tiersMax?, language?, lifecycle?, freshnessAfter? } }`
Response: `{ query, mode, results: [{ chunkId, pageId, url, title, headingPath, pageType, sourceTier, snippet, scores:{ semantic, keyword, fused, tier, freshness }, via }] }`

## Error handling

- Bad request body → 400 `validation_failed` (Zod `safeParse`, mirrors KB worker).
- KB search HTTP non-2xx / unparseable → 502 `kb_search_failed` (consumer can't ground an answer without retrieval).
- Empty results → 200 with `NO_CONTEXT_ANSWER` + zeroed scores (not an error).
- `LLM_PROVIDER=openrouter` missing key/gateway vars → fail-fast `LlmError` at factory (build path never triggers this).

## Testing strategy (gate 95/95/95/90, istanbul, vitest-pool-workers)

- Pure libs: direct unit tests (assembly budget, scoring edge cases, eval metrics — all already have PoC tests to port).
- `HttpKbSearchClient`: stub `fetcher` returning canned JSON + error/parse-failure branches.
- `OpenRouterLlmProvider`: stub `fetcher` (request shaping + HTTP-error + no-choices branches).
- `query` handler: `MockKbSearchClient` + `MockLlmProvider` → full pipeline; empty-retrieval; validation-failure; kb-search-failure (mock throws).
- **Zero external calls.** `KB_SEARCH=mock`, `LLM_PROVIDER=mock` in `vitest.config.ts` env.

## Out of scope (this run)

Live OpenRouter calls; Cloudflare AI Gateway creation; `deploy-rag-worker.yml`; pushing to `master`; embeddings/Vectorize/D1 in this worker; richer context than the 300-char search snippet (future: fetch full chunk text via KB `GET /v1/kb/pages/:id/chunks`).

## Build sequence (the plan)

1. Scaffold `apps/reyn-rag-worker` configs (mirror kb-worker: package.json, wrangler.toml — **no resource bindings**, tsconfig, eslint, .prettierrc, vitest.config, env.d.ts), `types/env.ts`, `lib/errors.ts`, Hono `index.ts` + health. Gate green.
2. Port pure libs + tests: `context-assembly`, `scoring`, `eval-metrics`. Gate green.
3. `llm/` seam (port) + tests. Gate green.
4. `kb-search/` seam (NEW: types, Http, Mock, factory) + tests. Gate green.
5. `schemas/rag.ts` + `handlers/rag/query.ts` (rewired) + tests. Gate green.
6. `eval/` (golden.json + run.ts, coverage-excluded). 
7. ADR-0025 (RAG consumer worker on top of KB search; mock-default; OpenRouter via AI Gateway opt-in). `docs/rag/{architecture,api}.md`. CLAUDE.md mention.
8. CI `rag-worker` job in `.github/workflows/ci.yml` (mirror kb-worker job). **No** deploy workflow yet (live deferred).
9. Full local gate green; commit incrementally; push `feat/rag-consumer` to origin. **Never master.**
```
