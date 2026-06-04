# Reyn Knowledge Base — architecture

> The KB is a **serverless knowledge engine** for Baldur's Gate 3 content: it ingests
> wiki pages, models them as structured first-class entities with typed relationships
> and an explicit rules layer, indexes them for **hybrid (semantic + keyword + filtered
> + relationship-aware) search**, and reconciles/observes itself. It runs as a single
> Cloudflare Worker (`apps/reyn-kb-worker`). **It does not generate answers** — LLM /
> RAG-chat is explicitly out of scope; the search API is the contract a future answer
> layer would consume.

## Component map

```
                 ┌──────────────────────── reyn-kb-worker (Cloudflare Worker) ───────────────────────┐
  crawler        │                                                                                   │
  (tools/        │   Ingestion API            Indexing pipeline           Retrieval                  │
   crawl.ts) ──▶ │   POST /sources            POST /pages/:id/index       POST /search               │
  Crawlee,       │   POST /pages   ──rules──▶  extract → section →          semantic arm (Vectorize)  │
  Node-side      │   POST /images             chunk → embed → upsert        keyword arm (FTS5 BM25)   │
                 │   (KB_INGEST_KEY)          (Vectorize meta+namespace)    → RRF fuse → rerank        │
                 │        │                    + FTS triggers + ledger      → relationship expand      │
                 │        ▼                    + relationships/entities                                │
                 │   ┌─────────┐   ┌────────┐   ┌──────────┐   ┌──────────────┐                        │
                 │   │  D1     │   │  R2    │   │ Vectorize│   │  Workers AI  │                        │
                 │   │ reyn_kb │   │ content│   │ bge-base │   │  bge-base    │                        │
                 │   └─────────┘   └────────┘   └──────────┘   └──────────────┘                        │
                 │   Observability:  GET /verify (cross-store reconciliation)   GET /stats             │
                 └───────────────────────────────────────────────────────────────────────────────────┘
```

## Layers

| Layer | Module(s) | Responsibility |
|---|---|---|
| HTTP | `src/index.ts`, `src/handlers/**` | Hono routes; ingest-key gating on writes, open reads. |
| Schemas | `src/schemas/**` | Zod request validation at every boundary. |
| Rules | `src/rules/**` | Table-driven normalize / validate / dedup / conflict ([rules](rules.md)). |
| Extraction | `src/lib/{extract,chunking,tokens}.ts` | HTMLRewriter → sections/blocks/links/images → heading-aware chunks. |
| Relationships | `src/lib/relationships.ts`, `src/handlers/kb/build-relationships.ts` | Typed `page_edges` graph + entity registration. |
| Retrieval | `src/lib/{fusion,scoring,search-filters}.ts`, `src/handlers/kb/search.ts` | Hybrid search ([retrieval](retrieval.md)). |
| Provider seams | `src/embedding/**`, `src/vector/**`, `src/store/**` | Mock + real impls behind interfaces, env-var selected. |
| Repos | `src/repo/**` | Hand-rolled D1 prepared statements, typed rows. |

## Storage

- **D1 (`reyn_kb`)** — source of truth: pages/sections/chunks, the typed relationship
  graph, entities, rules + audit, the embedding ledger, and the FTS5 mirror. See
  [data-model](data-model.md).
- **R2 (`reyn-kb-content`)** — raw crawled HTML, cleaned markdown, and image bytes.
- **Vectorize (`reyn-kb-bge-base`, 768-dim cosine)** — chunk embeddings with metadata +
  per-`page_type` namespaces. Cannot be enumerated in-Worker, so the D1 `embedding_state`
  ledger is the authoritative chunk→vector map.
- **Workers AI (`@cf/baai/bge-base-en-v1.5`)** — embeddings.

## Build-vs-adapt stance

Platform-first + hand-roll inside the Worker ([ADR-0017](../adr/0017-knowledge-base-worker-platform-first.md)):
the only runtime deps are `hono` + `zod`. We adopt Cloudflare platform features —
**HTMLRewriter** (extraction, [ADR-0018](../adr/0018-htmlrewriter-content-extraction.md)),
**D1 FTS5** (keyword/BM25), **Vectorize metadata + namespaces**
([ADR-0022](../adr/0022-vectorize-metadata-namespaces-supersede.md)) — rather than npm
libraries. The single adopted library is the **crawler (Crawlee)**, which lives in a
Node-side tool *outside* the Worker bundle ([ADR-0024](../adr/0024-adopt-crawlee-ingestion-crawler.md), [crawler](crawler.md)).

## ADR index

| ADR | Decision |
|---|---|
| [0017](../adr/0017-knowledge-base-worker-platform-first.md) | New KB Worker, platform-first + minimal deps, D1 FTS5 |
| [0018](../adr/0018-htmlrewriter-content-extraction.md) | HTMLRewriter extraction behind a seam |
| [0019](../adr/0019-kb-data-model-and-relationship-taxonomy.md) | Data model + relationship taxonomy |
| [0020](../adr/0020-table-driven-rules-engine.md) | Table-driven rules engine |
| [0021](../adr/0021-chars-over-four-tokenization.md) | `chars/4` token estimate |
| [0022](../adr/0022-vectorize-metadata-namespaces-supersede.md) | Vectorize metadata + namespaces; supersede-in-place |
| [0023](../adr/0023-hybrid-rrf-retrieval.md) | Hybrid RRF retrieval (search contract, no LLM) |
| [0024](../adr/0024-adopt-crawlee-ingestion-crawler.md) | Adopt Crawlee for the ingestion crawler |

## Further reading

- [API reference](api.md) · [Data model](data-model.md) · [Rules](rules.md) ·
  [Retrieval](retrieval.md) · [Crawler](crawler.md) · [Operations](operations.md)
