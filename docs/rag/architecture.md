# RAG consumer worker — architecture

`apps/reyn-rag-worker` is a thin **retrieval-augmented generation** layer that turns the Knowledge Base worker's hybrid search into grounded, cited answers. It is the deferred "Phase 5" generation surface; the KB worker ([`docs/kb/`](../kb/architecture.md)) owns all retrieval and stays LLM-free (ADR-0017, ADR-0023). This worker is the first **consumer** of the KB search API (ADR-0025).

## Boundary

- Runtime deps: **`hono` + `zod`** only.
- **No Cloudflare resource bindings.** No `AI`, `VECTORIZE`, `KB_DB`, or `R2`. Retrieval is an outbound HTTP call to the KB worker; generation is an outbound HTTP call to OpenRouter via the Cloudflare AI Gateway. This makes the worker a pure orchestration layer — easy to test and deploy.

## Request flow — `POST /v1/rag/query`

```
{ question, topK?, filters? }
  → KbSearchClient.search({ query: question, topK, mode:"hybrid", filters })   (HTTP → KB worker /v1/kb/search)
  → dedupe citations by chunkId (KB search already ranks by fused + tier)
  → assembleContext(results.map(r => r.snippet), 6000 chars)                   (token-budgeted, chars≈token/4)
  → LlmProvider.generate({ system, prompt, temperature: 0.2 })                 (Mock | OpenRouter)
  → scores { relevance, confidence, freshness }
  → { answer, citations[], scores }
```

- **Empty retrieval** → `200` with a fixed "no context" answer and zeroed scores (not an error).
- **Retrieval failure** (KB worker unreachable / non-2xx / bad shape) → `502 kb_search_failed` — we cannot ground an answer without retrieval.

## Seams (constructor-injected; mock + real, both coverage-gated)

| Seam | Interface | Real impl | Mock | Env selector |
|---|---|---|---|---|
| Retrieval | `IKbSearchClient` | `HttpKbSearchClient({ baseUrl, fetcher })` → `POST {KB_BASE_URL}/v1/kb/search` | `MockKbSearchClient` (canned BG3 results; `noresults`/`searchfail` query sentinels) | `KB_SEARCH` (`http`\|`mock`) |
| Generation | `ILlmProvider` | `OpenRouterLlmProvider` (chat completions via Cloudflare AI Gateway) | `MockLlmProvider` (deterministic) | `LLM_PROVIDER` (`mock`\|`openrouter`) |

`fetcher` is injected into both real adapters, so their request-shaping and error paths are unit-tested with stubs and count toward coverage **without touching the network**.

## Scoring (pure, `src/lib/scoring.ts`)

The KB search response already carries per-result sub-scores, so the answer scores are derived from them:

- **relevance** = mean of the results' `scores.semantic` (null/keyword-only matches excluded).
- **confidence** = fraction of those semantic scores ≥ `0.5` (coverage).
- **freshness** = max of the results' `scores.freshness` (the KB worker computed per-result recency).

Re-ranking is **not** re-implemented here — KB search already orders by `fused + tier`.

## Configuration

`wrangler.toml` `[vars]`: `KB_SEARCH`, `KB_BASE_URL`, `LLM_PROVIDER`, `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_NAME`, `OPENROUTER_MODEL` (default `google/gemma-4-31b-it:free`). Secret (openrouter path only): `OPENROUTER_API_KEY`.

The live model goes through OpenRouter so caching, rate-limiting, and spend visibility come from the AI Gateway; OpenRouter itself is prepaid (a hard spend ceiling). The default model is a free ($0) tier.

## Testing

`vitest-pool-workers`, istanbul, 95/95/95/90. The config pins `KB_SEARCH=mock` + `LLM_PROVIDER=mock`, so the whole suite runs offline with zero external calls and $0 cost. The eval CLI (`eval/run.ts`) is coverage-excluded (it needs a live worker); its metrics live in `src/lib/eval-metrics.ts` and are gated.

## Deferred (not in first cut)

- **Live deploy** (`deploy-rag-worker.yml`, AI Gateway provisioning, secret push) — owner-triggered, separate from the mock-only build.
- **Richer context** — fetch full chunk text via the KB worker's `GET /v1/kb/pages/:id/chunks` instead of the ~300-char search snippet.
- **Service Bindings** worker-to-worker instead of HTTP, once co-deployed.
- **LLM-judge grounding** in eval (the current `groundedProxy` is a coarse non-empty-answer-with-citations check).
