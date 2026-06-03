# ADR-0012: Embed with Workers AI `@cf/baai/bge-base-en-v1.5` behind a pluggable `EmbeddingProvider`

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

RAG retrieval needs text embeddings for both ingested chunks and incoming queries. The two realistic options are Cloudflare **Workers AI** (edge-native, no external key, billed in neurons) and **OpenAI `text-embedding-3-small`** (1536-dim, higher quality) proxied through AI Gateway (external key + cost). The PoC's guiding constraint is "build and demo with zero external credits", and the stack is already Cloudflare-native.

A Vectorize index's dimensionality is **fixed at creation**, so the embedding model is an architectural commitment, not a runtime toggle.

## Decision

Default to **Workers AI `@cf/baai/bge-base-en-v1.5` (768-dim)** via the `AI` binding, wrapped in an **`EmbeddingProvider`** interface (env var `EMBEDDING_PROVIDER`) with a deterministic `MockEmbeddingProvider` for tests. The Vectorize index is created at **768** dimensions, cosine metric. Embeddings are **not** routed through OpenRouter (its embeddings support is thin). Comparing other models (BGE small/large/`bge-m3`, or OpenAI) is a **tuning-phase** activity using **parallel Vectorize indexes**; the external-key OpenAI comparison is deferred.

## Consequences

**Positive**
- No external key; lowest PoC cost; runs on Cloudflare's edge.
- The provider seam makes a future model swap a localised change.

**Negative**
- 768-dim BGE quality is below 1536-dim OpenAI; acceptable for a PoC.
- Workers AI is metered (≈10k free neurons/day) and runs remotely even in dev.

**Neutral**
- Model comparison requires a second index (dimension is frozen per index), not a config flip.

## Alternatives considered

- **OpenAI `text-embedding-3-small` via AI Gateway.** Deferred — external key + cost; revisit during tuning.
- **Embeddings via OpenRouter.** Rejected — OpenRouter is generation-focused; embeddings support is inconsistent.

## Verification

- `MockEmbeddingProvider` returns deterministic 768-dim unit vectors (stable across runs) so cosine search in tests is meaningful.
- `WorkersAiEmbeddingProvider` is unit-tested with a stub `AI` binding (no live call); a developer-run smoke embeds against a real account via `wrangler dev --remote`.

## References

- Workers AI text embeddings: <https://developers.cloudflare.com/workers-ai/models/>
- Vectorize limits (fixed dimensions): <https://developers.cloudflare.com/vectorize/platform/limits/>
- [[adr-0013-generation-openrouter-ai-gateway-deferred]] — the generation counterpart.
