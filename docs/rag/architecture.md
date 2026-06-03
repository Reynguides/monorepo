# RAG worker architecture

`reyn-rag-worker` is an isolated Cloudflare Worker that crawls BG3 wiki
sources, stores and indexes the content, and answers natural-language queries
with source citations. It is entirely independent of `reyn-cloud-worker` (no
shared bindings, no user-account coupling) per [[ADR-0011]].

## Infrastructure roles

| Binding | Resource | Role |
|---|---|---|
| `KB_DB` (D1) | `reyn_kb` | Bookkeeping: sources, pages, images, chunks, embedding ledger, crawl state |
| `KB_BUCKET` (R2) | `reyn-kb-content` | Raw crawled HTML, cleaned markdown, and image bytes |
| `VECTORIZE` | `reyn-kb-bge-base` | 768-dim cosine index of chunk embeddings |
| `AI` (Workers AI) | — | `@cf/baai/bge-base-en-v1.5` embedding model (768 dims) per [[ADR-0012]] |

The LLM path routes through **Cloudflare AI Gateway → OpenRouter** and is
opt-in via `LLM_PROVIDER=openrouter`. The default everywhere — dev, CI, and
all unit tests — is `LLM_PROVIDER=mock` per [[ADR-0013]].

## Provider-seam / factory pattern

Every external capability is hidden behind an interface and selected by an
environment variable. This makes the entire pipeline testable with zero live
infrastructure in CI.

| Interface | Env var | Live value | Test value |
|---|---|---|---|
| `EmbeddingProvider` | `EMBEDDING_PROVIDER` | `workers-ai` | `mock` |
| `VectorIndexClient` | `VECTOR_INDEX` | `vectorize` | `mock` |
| `ObjectStore` | `OBJECT_STORE` | `r2` | `mock` |
| `LlmProvider` | `LLM_PROVIDER` | `openrouter` | `mock` (default) |

The vitest config overrides all four selectors to `mock`, so `pnpm test:coverage`
never calls Workers AI, Vectorize, R2, or OpenRouter.

## Ingestion flow

The crawl CLI does two things only: it **registers the source** (once,
idempotently) and **stores raw pages**. Indexing is a **separate, manual step**
the operator triggers per page — the crawler does NOT call the index endpoint.

```text
pnpm crawl
  │
  ├─ POST /v1/kb/sources         register source (id, name, baseUrl, tier)
  │                              idempotent on id — re-runs are a no-op
  ├─ robots.ts                   honour robots.txt disallow rules, rate-limit per host
  ├─ sitemap.ts                  fetch sitemap XML, enumerate page URLs
  └─ pipeline.ts       for each URL:
       │
       ├─ POST /v1/kb/pages           store raw HTML + content_hash to D1 + R2
       │                              ADR-0016: UNIQUE(source_id, url) identity
       └─ POST /v1/kb/crawl-state     persist cursor + status for resume

# Indexing — a SEPARATE manual step, NOT done inline by the crawler:
POST /v1/kb/pages/:id/index
  │
  ├─ html-clean.ts          strip boilerplate, convert to markdown
  ├─ chunking.ts            sliding-window split (1200 / 150 default)
  ├─ EmbeddingProvider      embed each chunk (Workers AI or mock)
  ├─ VectorIndexClient      upsert vectors (Vectorize or mock)
  ├─ repo/chunks            write chunk rows to D1
  └─ repo/embedding-state   update ledger (chunk_id → vector_id)
```

Page identity is `UNIQUE(source_id, url)` — `content_hash` is a
change-detector, not identity ([[ADR-0016]]). If the hash is unchanged the
index step is a no-op. If it changes the existing chunks are superseded in
place: existing chunk rows and their Vectorize vectors (tracked by the
`embedding_state` ledger) are deleted before the new set is written.

## Query flow

```text
POST /v1/rag/query  { question, topK? }
  │
  ├─ EmbeddingProvider     embed the question
  ├─ VectorIndexClient     top-K vector search (cosine)
  ├─ rerank.ts             tier-rerank: source tier × cosine score
  ├─ context-assembly.ts   build <context> block from top chunks
  ├─ LlmProvider           generate answer (mock → synthetic; openrouter → live)
  ├─ scoring.ts            compute relevance / confidence / freshness scores
  └─ { answer, citations, scores }
```

`citations` are deduped by chunk id and ordered by re-ranked score; each
carries `url`, `sourceTier`, and `chunkId`. `scores` are three independent
signals, each in [0, 1]:

- **relevance** — mean cosine similarity of the top chunks.
- **confidence** — fraction of chunks whose cosine score exceeds a threshold.
- **freshness** — recency of the most recent crawl timestamp in the context.

## Definition of done (PoC 2, Phase 7)

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` —
  **269 tests**, coverage ~99.3% stmts / 96% branches / 100% funcs / 99.5% lines
  (≥95/95/95/90 gate — all green).
- [x] OpenRouter is opt-in; `LLM_PROVIDER=mock` is the default; `OPENROUTER_API_KEY`
  is absent in CI and never required to pass the test suite ([[ADR-0013]]).
- [x] ADRs [[ADR-0011]]–[[ADR-0016]] are accepted and locked.
- [x] CI `rag-worker` job added to `.github/workflows/ci.yml`; deploy workflow
  at `.github/workflows/deploy-rag-worker.yml` is `workflow_dispatch`-only
  per [[ADR-0010]].
- [x] All phases (0–7) of PoC 2 implemented on branch `feat/poc2-rag-infra`.

## References

- [[ADR-0011]] — Separate worker rationale.
- [[ADR-0012]] — Embedding model choice (Workers AI BGE-base-en-v1.5).
- [[ADR-0013]] — LLM provider: OpenRouter via AI Gateway, opt-in, mock default.
- [[ADR-0014]] — Shared global corpus; open reads; ingestion-key-gated writes.
- [[ADR-0015]] — Crawl sourcing and licensing policy.
- [[ADR-0016]] — Page identity by URL, supersede in place.
- [`docs/rag/api.md`](api.md) — Endpoint reference.
- [`docs/rag/operations.md`](operations.md) — Bootstrap + runbook.
- [`docs/rag/tuning.md`](tuning.md) — Evaluation harness and chunk-size sweep.
