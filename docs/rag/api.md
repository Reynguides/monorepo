# RAG consumer worker — API

Base path: the deployed worker origin. All endpoints are **open reads** (no auth); there are no write endpoints (this worker stores nothing).

## `GET /v1/health`

Liveness probe.

```json
{ "ok": true, "time": "2026-06-11T19:40:00.000Z" }
```

## `POST /v1/rag/query`

Retrieval-augmented answer for a question, grounded in the KB corpus, with citations and quality scores.

### Request

```json
{
  "question": "What is Shadowheart's background and class?",
  "topK": 5,
  "filters": { "pageTypes": ["creature"], "tiersMax": 1 }
}
```

| Field | Type | Notes |
|---|---|---|
| `question` | string (1–2000) | required |
| `topK` | int (1–20) | optional; default 5. Passed to KB search. |
| `filters` | object | optional; forwarded verbatim to KB search. Keys: `pageTypes` (string[]), `tiersMax` (int ≥1), `language` (string), `lifecycle` (string), `freshnessAfter` (epoch-ms int). |

### Response — `200`

```json
{
  "answer": "Shadowheart is a half-elf cleric of Shar ...",
  "citations": [
    { "url": "https://bg3.wiki/wiki/Shadowheart", "sourceTier": 1, "chunkId": "mock-shadowheart:0" },
    { "url": "https://bg3.wiki/wiki/Shar", "sourceTier": 1, "chunkId": "mock-shar:0" }
  ],
  "scores": { "relevance": 0.715, "confidence": 1, "freshness": 0.9 }
}
```

- `citations` — deduped by `chunkId`, in retrieval (re-ranked) order.
- `scores` — each in `[0, 1]`: `relevance` (mean semantic similarity of retrieved chunks), `confidence` (share of chunks above the similarity threshold), `freshness` (recency of the freshest cited page).

Under `LLM_PROVIDER=mock` the `answer` is a deterministic placeholder (prefixed `[mock-llm]`); citations and scores are real (they derive from retrieval). Set `LLM_PROVIDER=openrouter` for a real generated answer.

### Empty retrieval — `200`

When the KB returns no matches:

```json
{
  "answer": "I don't have any relevant indexed context to answer that question.",
  "citations": [],
  "scores": { "relevance": 0, "confidence": 0, "freshness": 0 }
}
```

### Errors

| Status | `error` | When |
|---|---|---|
| `400` | `validation_failed` | Body is not valid JSON or fails the request schema (`issues` lists the Zod problems). |
| `502` | `kb_search_failed` | The KB search call failed (unreachable, non-2xx, or an unexpected response shape). No answer can be grounded. |

### Example

```bash
curl -s -X POST "$RAG_BASE_URL/v1/rag/query" \
  -H 'Content-Type: application/json' \
  -d '{"question":"How do I recruit Karlach?"}'
```
