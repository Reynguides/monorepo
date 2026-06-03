# ADR-0013: Generate answers via OpenRouter through Cloudflare AI Gateway — deferred and opt-in

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The RAG pipeline's final step turns retrieved context into a cited answer with an LLM. The project standardised on **OpenRouter** (OpenAI-compatible chat/completions, easy model-swapping). But the PoC must build, test, and demo with **zero external credits**, and CI must never make paid/external calls. We also want the live path always compiled and covered — not commented out, which rots and dodges the type-checker and the coverage gate.

## Decision

Define an **`LlmProvider`** interface (env var `LLM_PROVIDER`). The **default everywhere — dev, CI, all unit tests — is `mock`** (a deterministic `MockLlmProvider` that synthesises an answer from the retrieved context). The real **`OpenRouterLlmProvider`** routes through **Cloudflare AI Gateway** (caching, cost/latency observability, rate-limiting) and is selected **only** by `LLM_PROVIDER=openrouter`. CI never calls external models. The real adapter is **constructor-injected (a `fetcher`) and unit-tested with a mocked fetcher** so it counts toward coverage; an env-gated live run is an extra manual smoke. The specific live model(s) and any fallback/routing are **decided at enable-time**, not now.

## Consequences

**Positive**
- The entire pipeline runs end-to-end on the mock with zero credits; CI stays free and deterministic.
- Switching to a real model is an env var, never a code edit; AI Gateway adds caching/observability when live.

**Negative**
- An extra seam and a mock whose answers aren't representative of real quality (real-quality measurement is the env-gated eval path).

**Neutral**
- `OPENROUTER_API_KEY` is required only for opt-in live runs; absent in CI.

## Alternatives considered

- **Call OpenRouter directly (no gateway).** Rejected — loses caching/observability/cost-tracking.
- **Workers AI LLM for generation.** Rejected — constrains model choice; OpenRouter's model breadth is the point.
- **Comment out the live adapter until needed.** Rejected — breaks compilation/coverage and rots; an env-selected seam is verifiable.

## Verification

- `pnpm test:coverage` passes with `LLM_PROVIDER=mock`; `OpenRouterLlmProvider` is covered via a mocked fetcher.
- A developer-run smoke (`LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY`) returns a live answer for one query.

## References

- Cloudflare AI Gateway (OpenRouter provider): <https://developers.cloudflare.com/ai-gateway/>
- [[adr-0012-embeddings-workers-ai-bge-base]] — the embedding counterpart (stays on Workers AI).
