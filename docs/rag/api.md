# RAG worker API reference

All endpoints live under `https://reyn-rag-worker.<subdomain>.workers.dev`.
JSON is the only content type accepted and returned.

**Access control** (per [[ADR-0014]]): read endpoints are open (no auth).
Write / ingest endpoints require `Authorization: Bearer <KB_INGEST_KEY>`.
A missing or incorrect bearer returns `401 unauthorized`. A missing
`KB_INGEST_KEY` secret on the worker returns `500 server_misconfigured`.

## Health

### `GET /v1/health`

Returns `200` when the worker is reachable.

```json
{ "ok": true, "time": "2026-06-03T12:00:00.000Z" }
```

---

## KB sources

### `POST /v1/kb/sources` — ingest key required

Register a crawl source. Sources have a numeric `tier` that influences
retrieval ranking (lower = more authoritative).

**Request body**

```json
{
  "name": "BG3 Wiki",
  "baseUrl": "https://bg3.wiki",
  "tier": 1
}
```

| Field | Type | Constraints |
|---|---|---|
| `name` | string | 1–256 chars |
| `baseUrl` | string (URL) | max 2048 chars |
| `tier` | integer | 1–1000 |

**Response `201`**

```json
{ "sourceId": "<uuid>" }
```

---

## KB pages

### `POST /v1/kb/pages` — ingest key required

Store a crawled page (raw HTML). The page row is keyed by
`UNIQUE(source_id, url)` per [[ADR-0016]]. Returns `changed: true` when the
`content_hash` differed from the stored value (triggers re-index).

**Request body**

```json
{
  "sourceId": "<uuid>",
  "url": "https://bg3.wiki/wiki/Astarion",
  "title": "Astarion",
  "html": "<html>…</html>"
}
```

| Field | Type | Constraints |
|---|---|---|
| `sourceId` | string | non-empty |
| `url` | string (URL) | max 2048 chars |
| `title` | string | max 1024 chars, optional |
| `html` | string | 1 byte – 4 MiB |

**Response `201`**

```json
{ "pageId": "<uuid>", "changed": true }
```

---

### `GET /v1/kb/pages?source=<sourceId>&limit=<n>&cursor=<token>`

Cursor-paginated list of pages for a source. `source` is required.
`limit` defaults to 50 (max 500). Returns `nextCursor: null` when
the result set is exhausted.

**Response `200`**

```json
{
  "items": [
    {
      "id": "<uuid>",
      "sourceId": "<uuid>",
      "url": "https://bg3.wiki/wiki/Astarion",
      "title": "Astarion",
      "contentHash": "sha256:…",
      "crawledAt": 1748908800000,
      "updatedAt": 1748908800000
    }
  ],
  "nextCursor": "<opaque-token-or-null>"
}
```

---

### `GET /v1/kb/pages/:id`

Return a single page including stored `html` and `markdown`.

**Response `200`**

```json
{
  "id": "<uuid>",
  "sourceId": "<uuid>",
  "url": "https://bg3.wiki/wiki/Astarion",
  "title": "Astarion",
  "contentHash": "sha256:…",
  "crawledAt": 1748908800000,
  "updatedAt": 1748908800000,
  "html": "<html>…</html>",
  "markdown": "# Astarion\n…"
}
```

Returns `404` when the page is not found.

---

### `POST /v1/kb/pages/:id/index` — ingest key required

Clean, chunk, embed, and upsert a stored page into the vector index.
Supersedes existing chunks in place if the page was already indexed
(per [[ADR-0016]]).

**Response `200`**

```json
{
  "pageId": "<uuid>",
  "chunks": 12,
  "reindexed": true
}
```

`chunks` is the count of newly created chunks. `reindexed: true` when
prior chunks were replaced.

---

## KB images

### `POST /v1/kb/images` — ingest key required

Store an image associated with a page (PNG, JPEG, WebP, GIF; max 16 MiB base64-encoded).
SVG is excluded (inline-script risk).

**Request body**

```json
{
  "pageId": "<uuid>",
  "url": "https://bg3.wiki/images/astarion.webp",
  "altText": "Astarion portrait",
  "contentBase64": "<base64>",
  "contentType": "image/webp"
}
```

**Response `201`**

```json
{ "imageId": "<uuid>" }
```

---

### `GET /v1/kb/images/:id`

Retrieve a stored image. Returns the raw bytes with the original `Content-Type`.
Returns `404` when the image is not found.

---

## KB verify

### `GET /v1/kb/verify`

Integrity check: cross-references D1 rows against R2 objects and the
`embedding_state` ledger, and spot-checks a sample of vector ids against
the Vectorize index. A healthy corpus should return all empty arrays.

**Response `200`**

```json
{
  "pages": {
    "total": 120,
    "missingR2": []
  },
  "images": {
    "total": 48,
    "missingR2": []
  },
  "chunks": {
    "total": 1440,
    "missingEmbedding": [],
    "missingVector": []
  }
}
```

| Field | Meaning |
|---|---|
| `missingR2` | D1 page rows whose R2 object is absent |
| `missingEmbedding` | Chunk ids with no `embedding_state` ledger row |
| `missingVector` | Recorded vector ids that did not resolve in Vectorize |

---

## KB crawl state

### `POST /v1/kb/crawl-state` — ingest key required

Upsert crawl progress for a source. Used by the CLI to persist a
resumable cursor between runs.

**Request body**

```json
{
  "sourceId": "<uuid>",
  "cursor": 42,
  "status": "running",
  "lastSitemapAt": 1748908800000
}
```

`lastSitemapAt` (epoch ms) is optional; omitting it preserves the stored value.

**Response `200`**

```json
{
  "cursor": 42,
  "status": "running",
  "lastSitemapAt": 1748908800000
}
```

---

### `GET /v1/kb/crawl-state/:sourceId`

Retrieve the current crawl state for a source. Returns `404` when no
state row exists.

**Response `200`**

```json
{
  "cursor": 42,
  "status": "done",
  "lastSitemapAt": 1748908800000
}
```

---

## RAG query

### `POST /v1/rag/query`

Retrieve-augmented Q&A. The endpoint is **open** (no auth required) —
reads are open per [[ADR-0014]]. **There is no rate limiting in this PoC
release**; add a Cloudflare rate-limit rule before any public exposure
(see `docs/rag/operations.md#known-limitations`).

**Request body**

```json
{
  "question": "What are Astarion's approval triggers?",
  "topK": 5
}
```

| Field | Type | Constraints |
|---|---|---|
| `question` | string | 1–2000 chars |
| `topK` | integer | 1–20, optional (default 5) |

**Response `200`**

```json
{
  "answer": "Astarion approves of …",
  "citations": [
    {
      "url": "https://bg3.wiki/wiki/Astarion",
      "sourceTier": 1,
      "chunkId": "<uuid>"
    }
  ],
  "scores": {
    "relevance": 0.87,
    "confidence": 0.72,
    "freshness": 0.95
  }
}
```

| Field | Meaning |
|---|---|
| `answer` | LLM-generated (or mock-generated) answer string |
| `citations` | Re-ranked chunks, deduped by `chunkId`, in score order |
| `scores.relevance` | Mean cosine similarity of top chunks [0, 1] |
| `scores.confidence` | Fraction of chunks above similarity threshold [0, 1] |
| `scores.freshness` | Recency of the most recent crawl timestamp [0, 1] |

With `LLM_PROVIDER=mock` (the default) the `answer` is a deterministic
stub synthesised from the retrieved context. Set `LLM_PROVIDER=openrouter`
and provide `OPENROUTER_API_KEY` for live answers (see [[ADR-0013]]).

---

## Error shape

All errors follow a consistent envelope:

```json
{ "error": "<code>", "message": "<detail>" }
```

Common codes:

| HTTP | `error` | Cause |
|---|---|---|
| 400 | `validation_failed` | Request body failed Zod schema |
| 401 | `unauthorized` | Missing or wrong `KB_INGEST_KEY` bearer |
| 404 | `not_found` | Resource does not exist |
| 500 | `server_misconfigured` | `KB_INGEST_KEY` env var not set |
| 500 | `internal_error` | Unexpected failure |
