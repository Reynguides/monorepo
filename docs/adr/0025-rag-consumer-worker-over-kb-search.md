# ADR-0025: RAG answer generation as a separate consumer Worker over the KB search API

- **Status**: Accepted — 2026-06-11
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The Knowledge Base worker (`apps/reyn-kb-worker`, [[adr-0017-knowledge-base-worker-platform-first]]) deliberately stops at a hybrid **search** API ([[adr-0023-hybrid-rrf-retrieval]]); LLM answer generation (RAG chat) was explicitly scoped out as "a future consumer of this search API". We now want that consumer: a grounded, cited Q&A endpoint.

A prior PoC (`apps/reyn-rag-worker` on branch `feat/poc2-rag-infra`) already implemented generation, but it did its **own** retrieval — query embedding, Vectorize search, D1 chunk hydration, in-code re-rank — duplicating what the KB worker now owns. Reusing that design would couple two workers to the same retrieval logic and let them drift.

Constraints (owner-confirmed): BG3-only; Cloudflare serverless; the same quality bar as the rest of Reyn (strict TS, 95/95/95/90 coverage, ADRs, docs, CI). Generation goes to **OpenRouter via the Cloudflare AI Gateway**, mock-by-default and opt-in only ([[adr-0013-generation-openrouter-ai-gateway-deferred]] is the rag-branch precedent; this ADR re-affirms it on `master`). The default live model is `google/gemma-4-31b-it:free` (a $0 free model; the slug is the only open knob).

## Decision

1. **A new worker `apps/reyn-rag-worker`** (the name is reused; the abandoned PoC never landed on `master`, and this is a fresh, differently-shaped implementation — not a resurrection of that code). It exposes `POST /v1/rag/query` (open read).

2. **Retrieval is delegated, not re-implemented.** The worker calls the KB worker's `POST /v1/kb/search` through an injected `IKbSearchClient` seam (`Http` real impl + `Mock`). Consequently this worker has **no Cloudflare resource bindings at all** — no `AI`, `VECTORIZE`, `KB_DB`, or `R2`. It only needs `KB_BASE_URL` + the LLM seam config. The KB worker remains the single owner of embedding, vector search, FTS, RRF fusion, and tier/freshness re-rank.

3. **Generation behind the `ILlmProvider` seam**, ported from the PoC: `MockLlmProvider` (deterministic, the default via `LLM_PROVIDER=mock`) and `OpenRouterLlmProvider` (OpenAI-style chat completions POSTed through the Cloudflare AI Gateway, `LLM_PROVIDER=openrouter`, injected `fetcher`). The factory fail-fasts if the openrouter path is selected without its key/gateway/model vars. **CI never calls a live model**; the live path is owner-triggered.

4. **Re-rank is not ported.** KB search already returns results ordered by `fused + tier`, so the PoC's `rerank.ts` is subsumed. Answer scores map onto fields search already returns: `relevance` = mean of per-result semantic similarity, `confidence` = fraction of semantic scores ≥ 0.5, `freshness` = max per-result freshness. The pure `context-assembly`, `scoring`, and `eval-metrics` libs are ported with their tests.

5. **Context is built from search snippets** (the KB worker truncates chunk text to ~300 chars for `snippet`). Richer context (fetching full chunk text via the KB worker's `GET /v1/kb/pages/:id/chunks`) is a deferred enhancement, not first-cut scope.

## Consequences

**Positive**
- One owner of retrieval logic; the two workers cannot drift. This worker is a pure HTTP-orchestration layer — trivial to test (no bindings) and to deploy.
- Mock-by-default + injected fetchers ⇒ the whole pipeline (and both real adapters) is covered with **zero external calls**; the build and CI cost $0.
- Generation is swappable by an env var; the live model is a single config value.

**Negative**
- Two network hops on the live path (consumer → KB worker → Vectorize/AI) add latency vs. a single fused worker. Acceptable for a PoC-grade Q&A surface; co-location/Service Bindings are a future optimization.
- Snippet-only context (~300 chars/chunk) is thinner than the PoC's full-chunk context; flagged as a deferred enhancement.

**Neutral**
- The PoC worker on `feat/poc2-rag-infra` remains the reference for the ported pieces; it is not merged.

## Alternatives considered

- **Add `/v1/rag/query` inside `reyn-kb-worker`** — rejected: re-introduces the LLM path that ADR-0017 deliberately kept out, and adds a generation concern (and AI-Gateway secret surface) to the KB engine's bundle/boundary.
- **Resurrect `reyn-rag-worker` from the PoC branch** — rejected: it duplicates retrieval and carries the superseded flat-KB design; the memory note explicitly treats it as reference-only.
- **Service Bindings (worker-to-worker) instead of HTTP** — deferred: viable optimization once both workers are co-deployed; HTTP keeps the seam simple and testable now.

## Verification

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` green in `apps/reyn-rag-worker` (≥95/95/95/90), real adapters covered via injected stubs.
- Mock end-to-end: `POST /v1/rag/query` returns a cited, scored answer with **zero** external calls; empty retrieval → 200 + "no context"; retrieval failure → 502.
- Live path reachable only via `LLM_PROVIDER=openrouter` + `KB_SEARCH=http` + secrets (owner-run; not CI).

## References

- [[adr-0017-knowledge-base-worker-platform-first]], [[adr-0023-hybrid-rrf-retrieval]] — the KB worker + search contract this consumes.
- [[adr-0009-strict-ts-and-net-quality-gates]], [[adr-0010-ci-cd-github-actions]] — inherited quality + CI gates.
- Cloudflare AI Gateway (OpenRouter provider): <https://developers.cloudflare.com/ai-gateway/providers/openrouter/>
- OpenRouter models + pricing: <https://openrouter.ai/models>
- Design spec: `docs/superpowers/specs/2026-06-11-rag-consumer-design.md`.
