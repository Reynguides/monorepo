# RAG Tuning Methodology

This document explains how to run the evaluation harness, interpret the metrics,
and record the results of each tuning pass. The discipline is: **re-run
`pnpm test` + `pnpm eval` after every tuning pass and record the numbers here.**

## Prerequisites

- A Cloudflare account with the `reyn_kb` D1, `reyn-kb-content` R2, and
  `reyn-kb-bge-base` Vectorize index provisioned (see
  [`docs/cloudflare/local-development.md`](../cloudflare/local-development.md)).
- `KB_INGEST_KEY` set as a wrangler secret or in `.dev.vars`.
- Corpus indexed: at least the BG3 wiki pages that cover the 12 golden questions
  (see `eval/golden.json`).

## Running the evaluation

```bash
cd apps/reyn-rag-worker

# 1. Apply local KB-D1 migrations
pnpm exec wrangler d1 migrations apply reyn_kb --local

# 2. Start the worker with remote Workers AI embeddings
#    (EMBEDDING_PROVIDER=workers-ai is the wrangler.toml default)
pnpm exec wrangler dev --remote

# 3. Crawl + index BG3 wiki pages (run once per corpus refresh)
RAG_BASE_URL=http://127.0.0.1:8787 \
KB_INGEST_KEY=<your-key> \
pnpm crawl --source bg3-wiki --limit 100

# 4. Run the evaluation
RAG_BASE_URL=http://127.0.0.1:8787 pnpm eval
```

The CLI reads `eval/golden.json`, sends each question to `POST /v1/rag/query`,
and prints a per-item table plus an aggregate summary. The JSON report is written
to `eval/last-report.json` (gitignored — never commit it).

### Mock pipeline caveat

Against the local dev server using `EMBEDDING_PROVIDER=mock` (the default when
running `pnpm dev` without `--remote`), retrieval is not semantic — the mock
embedder returns a fixed vector regardless of input. This means citation hit-rate
will be effectively 0 in mock mode. The CLI still runs and validates the plumbing
(HTTP connectivity, schema parsing, metric computation), but the quality numbers
are meaningless. **Meaningful results require `--remote` or a deployed worker.**

To opt in to real LLM answers set `LLM_PROVIDER=openrouter` and provide the
`OPENROUTER_API_KEY` secret. The default `LLM_PROVIDER=mock` returns a fixed
stub answer, which passes `groundedProxy` only if citations are returned.

## Metrics explained

| Metric | Definition | Range |
|---|---|---|
| **hit-rate** | Fraction of expected URLs found in citations | [0, 1] |
| **precision** | Relevant citations / total citations | [0, 1] |
| **recall** | Relevant citations / total expected | [0, 1] |
| **grounded** | Proxy: answer non-empty AND citationCount > 0 | bool |
| **p50/p95 latency** | Percentile over per-item latency (ms) | ms |

All pure metric functions live in `src/lib/eval-metrics.ts` and are
coverage-gated at ≥95% / ≥90% in CI. The `groundedProxy` function is a cheap
binary signal — it cannot detect hallucination (an answer fabricated but backed
by zero citations fails, an answer factually wrong but with citations passes).
True hallucination measurement requires a second LLM judge call; that is roadmap
work.

## Chunk-size sweep

Chunk size controls the granularity of the indexed passages. Smaller chunks
retrieve more precise snippets but may miss context; larger chunks carry more
context but dilute cosine similarity.

1. Change `CHUNK_MAX_CHARS` and `CHUNK_OVERLAP_CHARS` in
   `src/handlers/kb/index-page.ts`.
2. Clear the Vectorize index and D1 chunks table (or use a fresh local dev
   environment).
3. Re-crawl and re-index the corpus.
4. Run `pnpm eval` and record `meanHitRate`, `meanRecall`, `p95LatencyMs`.
5. Repeat for each candidate and pick the setting with the best recall at
   acceptable latency.

Suggested sweep range (bge-base-en-v1.5, 768 dims):

| `CHUNK_MAX_CHARS` | `CHUNK_OVERLAP_CHARS` | Notes |
|---|---|---|
| 400 | 80 | Smallest — high precision, may miss cross-sentence context |
| 800 | 160 | Smaller — tighter snippets, may miss cross-sentence context |
| 1200 | 150 | Default — balanced |

Record results in the table at the bottom of this file.

## Embedding model comparison

The Vectorize index dimension is **fixed at creation time** — each embedding
model needs its own index. To compare models:

1. Provision a second Vectorize index (e.g. `reyn-kb-e5-large`) with the
   correct dimension for the target model.
2. Add a second `[[vectorize]]` binding in `wrangler.toml` and a second env-var
   selector variant.
3. Re-index the corpus with the new model.
4. Point the worker at each index in turn and run `pnpm eval`.
5. Compare `meanHitRate` and `meanRecall`.

Currently supported via `EMBEDDING_PROVIDER`:

| Value | Model | Dims | Notes |
|---|---|---|---|
| `workers-ai` | `@cf/baai/bge-base-en-v1.5` | 768 | Default |
| `mock` | Fixed zero-vector | N/A | Test/CI only |

## Prompt engineering and hallucination reduction

The query handler already enforces a trust boundary:

- The `<context>` block is labelled "untrusted reference data" in both the
  system prompt and the user prompt.
- The system prompt instructs the LLM to answer only from context and to say
  "I don't know" when the context doesn't contain the answer.

Further levers:

- **Temperature**: lower temperature (0.0–0.2) reduces creativity and
  hallucination. The query handler already passes a low default
  (`GENERATION_TEMPERATURE = 0.2` in `handlers/rag/query.ts`), which the
  OpenRouter path forwards to the model via the `temperature` field on
  `LlmInput`. Adjust the constant to retune; the mock provider ignores it.
- **Instruction following**: add a numbered list format requirement to the
  system prompt if structured output is needed for downstream parsing.
- **Re-ranking topK**: increase `topK` to retrieve more candidates before
  re-ranking; decreasing it reduces noise but may drop relevant chunks.

## Recorded tuning results

Add a row after each tuning pass. `n` is the number of golden questions answered
without error.

| Date | Chunk | Overlap | Model | n | MeanHitRate | MeanRecall | P95 ms | Notes |
|---|---|---|---|---|---|---|---|---|
| — | 1200 | 150 | bge-base | — | — | — | — | Baseline (not yet run against live) |
