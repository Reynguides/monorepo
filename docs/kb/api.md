# Reyn Knowledge Base — HTTP API

Base: the deployed Worker (e.g. `https://reyn-kb-worker.<account>.workers.dev`) or
`http://127.0.0.1:8787` under `wrangler dev`. All bodies are JSON, validated with Zod
([ADR-0009](../adr/0009-strict-ts-and-net-quality-gates.md) discipline).

## Authentication

- **Writes** (`POST` ingest/index) require `Authorization: Bearer <KB_INGEST_KEY>`
  ([ADR-0017](../adr/0017-knowledge-base-worker-platform-first.md)). Missing/blank → `401`;
  wrong key → `403`.
- **Reads** (`GET`, plus `POST /search`) are **open**.

## Error shape

Failures return a consistent body: `{ "error": "<code>", "message"?: "...", "details"?: ... }`
with the HTTP status. Common codes: `validation_failed` (400), `unauthorized` (401),
`forbidden` (403), `*_not_found` (404), `rule_validation_failed` (422).

## Endpoints

### `POST /v1/kb/sources` — register a source (idempotent)
Body: `{ id, name, baseUrl, tier, license? }`. → `200 { "sourceId": "<id>" }`.

### `POST /v1/kb/pages` — ingest a page
Body: `{ sourceId, url, html, title?, pageType?, language? }`. Runs the
normalize/validate/dedup rule phases at the write boundary ([rules](rules.md)):
- unchanged content (same `content_hash`) → `200 { pageId, changed:false }`
- a dedup hit → `200 { pageId:null, changed:false, deduped:true }`
- a validation failure → `422 { error:"rule_validation_failed", details:[…] }`
- otherwise stored → `200 { pageId, changed:true }`
- unknown `sourceId` → `404 source_not_found`

### `POST /v1/kb/pages/:id/index` — index a stored page
Extract → section → chunk → embed → upsert vectors (metadata + namespace) → write chunks
(FTS triggers fire) + ledger → build relationships; supersede-on-change first
([ADR-0022](../adr/0022-vectorize-metadata-namespaces-supersede.md)).
→ `200 { pageId, chunks, reindexed }`. `404` unknown page; `409` page with no stored HTML.

### `POST /v1/kb/images` — store an image
Body: `{ pageId, url, contentType, dataBase64, altText?, width?, height? }`. MIME allowlist
(png/jpeg/webp/gif — **no SVG**). → `200 { imageId, changed }`. `404` unknown page;
`400 invalid_base64`.

### `GET /v1/kb/pages?source=&limit=&cursor=` — list pages
→ `200 { items:[…], nextCursor }`. Cursor-paginated by id.

### `GET /v1/kb/pages/:id` — page detail
→ `200 { id, sourceId, url, canonicalUrl, title, pageType, summary, tags, language,
lifecycle, version, crawledAt, updatedAt, html, markdown }`. `404` if unknown.

### `GET /v1/kb/images/:id` — image bytes
→ `200` raw bytes with the stored `Content-Type`, `X-Content-Type-Options: nosniff`, and a
restrictive CSP. `404` if unknown / bytes missing.

### `POST /v1/kb/search` — hybrid retrieval (open)
Body: `{ query, topK?=10, mode?="hybrid"|"semantic"|"keyword", filters?, expand?=false,
expandEdgeTypes? }`. `filters`: `{ pageTypes?, tiersMax?, language?, lifecycle?,
freshnessAfter? }`. → `200 { query, mode, results:[…] }`. Each result:
`{ chunkId, pageId, url, title, headingPath, pageType, sourceTier, snippet,
scores:{ semantic, keyword, fused, tier, freshness }, via:"primary"|"relationship" }`.
**There is no `answer` field** ([retrieval](retrieval.md), [ADR-0023](../adr/0023-hybrid-rrf-retrieval.md)).
Empty `query` → `400`.

### `GET /v1/kb/verify` — reconciliation report (open)
→ `200 { ok, checks }`. `checks`: `chunksLackingEmbedding`, `orphanEmbeddings`,
`namespaceDrift`, `danglingEdges`, `danglingChunkImages`, `ftsConsistent`,
`pagesWithValidationFailures`. `ok` is structural integrity only (validation failures are
surfaced but not integrity-fatal). Always `200` — `ok:false` is a report, not an error.

### `GET /v1/kb/stats` — corpus counts (open)
→ `200 { sources, pages, sections, chunks, images, edges, entities, embeddings, rules,
ruleEvents, pagesByLifecycle:{…} }`.

### `GET /v1/health`
→ `200 { ok:true, time }`.
