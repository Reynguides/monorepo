# RAG worker operations

Runbook for `reyn-rag-worker`: one-time bootstrap, local dev, the
crawl→index→verify→query cycle, secret management, and known limitations.

## One-time bootstrap (new Cloudflare account)

The following resources must exist before the first deploy. Run these from
`apps/reyn-rag-worker` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
set in your environment (or via `.dev.vars`).

```bash
# 1. Create the KB D1 database
pnpm exec wrangler d1 create reyn_kb
# → prints: database_id = "<real-uuid>"

# 2. Create the Vectorize index (768 dims, cosine — fixed at creation per ADR-0012)
pnpm exec wrangler vectorize create reyn-kb-bge-base \
  --dimensions=768 --metric=cosine

# 3. Create the R2 bucket
pnpm exec wrangler r2 bucket create reyn-kb-content
```

After step 1, copy the real `database_id` UUID into
`apps/reyn-rag-worker/wrangler.toml` and commit. The placeholder
`00000000-0000-0000-0000-000000000000` is valid for local/test but will
cause the remote deploy to fail with `D1_ERROR`.

## Local development

Vectorize and Workers AI have no local Miniflare emulators — `wrangler dev`
without `--remote` falls back to the mock providers (all four env-var
selectors are overridden to `mock` in the vitest config and by the worker
when the live bindings are absent). To exercise the full live stack locally:

```bash
cd apps/reyn-rag-worker

# Apply KB D1 migrations to local SQLite (for mock/D1-only flows)
pnpm exec wrangler d1 migrations apply reyn_kb --local

# Start the worker connecting to real remote Workers AI + Vectorize
pnpm exec wrangler dev --remote
# → http://127.0.0.1:8787 with live embeddings
```

For the unit/integration test suite, mocks are always used — no live
credentials required:

```bash
pnpm test            # 269 tests, all mocked
pnpm test:coverage   # +coverage gate (95/95/95/90)
pnpm typecheck
pnpm lint
pnpm format:check
```

### Dev secrets

Create `apps/reyn-rag-worker/.dev.vars` (gitignored) with:

```text
KB_INGEST_KEY=dev-ingest-key-change-me
# Optional — only needed for LLM_PROVIDER=openrouter:
OPENROUTER_API_KEY=sk-or-…
```

## Crawl → index → verify → query runbook

### 1. Crawl sources

The CLI tool at `apps/reyn-rag-worker/tools/crawl.ts` fetches pages from the
configured sources and pushes them to the worker via the KB write endpoints.

```bash
cd apps/reyn-rag-worker
export RAG_BASE_URL=http://127.0.0.1:8787   # or deployed URL
export KB_INGEST_KEY=<your-key>

# Crawl BG3 Wiki, limit to 100 pages (omit --limit for a full crawl)
pnpm crawl --source bg3-wiki --limit 100
```

The CLI respects `robots.txt`, rate-limits per host, and persists a cursor via
`POST /v1/kb/crawl-state` so interrupted runs can resume. See
`docs/rag/sourcing-and-licensing.md` for the per-source licensing posture.

### 2. Index pages

Each stored page must be indexed before it is searchable. The index endpoint
cleans the HTML, splits it into chunks, embeds each chunk via the embedding
provider, and upserts the vectors into Vectorize.

```bash
# Index a single page by ID
curl -X POST "$RAG_BASE_URL/v1/kb/pages/<pageId>/index" \
     -H "Authorization: Bearer $KB_INGEST_KEY"

# The crawl CLI indexes pages inline during ingestion — manual calls are
# only needed to re-index after a chunk-size or model change.
```

### 3. Verify corpus integrity

```bash
curl "$RAG_BASE_URL/v1/kb/verify"
```

A healthy corpus returns all empty arrays. Non-empty `missingEmbedding` or
`missingVector` arrays indicate chunks that need re-indexing. See
`docs/rag/api.md#kb-verify` for the full response shape.

### 4. Query

```bash
curl -X POST "$RAG_BASE_URL/v1/rag/query" \
     -H "content-type: application/json" \
     -d '{"question":"What are Astarion approval triggers?","topK":5}'
```

With `LLM_PROVIDER=mock` (the default) the answer is a deterministic stub.
See the next section to enable live answers.

### 5. Evaluate

```bash
cd apps/reyn-rag-worker
RAG_BASE_URL=http://127.0.0.1:8787 pnpm eval
```

The eval harness reads `eval/golden.json`, queries the worker, and prints a
per-item table and aggregate summary. See `docs/rag/tuning.md` for the metrics
definition and recorded results.

## Enabling live OpenRouter answers

1. Set `LLM_PROVIDER=openrouter` in `wrangler.toml` (or `.dev.vars` for local).
2. Fill `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_NAME`, and `OPENROUTER_MODEL` in
   `wrangler.toml`.
3. Ensure `OPENROUTER_API_KEY` is set as a wrangler secret (or in `.dev.vars`).

```bash
echo "$OPENROUTER_API_KEY" | pnpm exec wrangler secret put OPENROUTER_API_KEY
```

Answers now route through Cloudflare AI Gateway → OpenRouter. The gateway
provides caching, cost tracking, and rate-limit controls.

## Deploying

See `.github/workflows/deploy-rag-worker.yml`. Deployment is
`workflow_dispatch`-only per [[ADR-0010]]; never run `--remote` migrations
from a laptop.

The workflow:
1. Applies `migrations/kb-d1/*.sql` against the remote `reyn_kb` D1
   (idempotent).
2. Re-pushes `OPENROUTER_API_KEY` and `KB_INGEST_KEY` secrets.
3. Runs `wrangler deploy`.

Required GitHub environment secrets: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `OPENROUTER_API_KEY`, `KB_INGEST_KEY`.

## Key rotation

### Rotate `KB_INGEST_KEY`

```bash
cd apps/reyn-rag-worker
NEW_KEY=$(openssl rand -hex 32)
echo "$NEW_KEY" | pnpm exec wrangler secret put KB_INGEST_KEY
```

Update `.dev.vars` and any CI secrets after rotation.

### Rotate `OPENROUTER_API_KEY`

Generate a new key in the OpenRouter dashboard, then:

```bash
echo "$NEW_KEY" | pnpm exec wrangler secret put OPENROUTER_API_KEY
```

## Adding a D1 migration

Create a new SQL file in `migrations/kb-d1/`:

```bash
# Filename convention: <NNN>_<description>.sql
# Example: 0002_add_sources_tier_index.sql
```

Apply locally:

```bash
pnpm exec wrangler d1 migrations apply reyn_kb --local
```

The remote apply runs automatically on the next Deploy RAG Worker workflow
dispatch. Never run `--remote` from a laptop.

## Wrangler tail (live logs)

```bash
cd apps/reyn-rag-worker
pnpm exec wrangler tail
```

For historical data, the Cloudflare dashboard's Logs panel covers the last
7 days on the paid plan.

## Known limitations

- **No rate limiting on `POST /v1/rag/query`.** With `LLM_PROVIDER=openrouter`
  every request makes a paid OpenRouter call. Before any public exposure, add a
  Cloudflare rate-limit rule on `POST /v1/rag/query` in the Cloudflare
  dashboard (Security → WAF → Rate Limiting). Without this, the endpoint is a
  cost and DoS exposure.
- **Vectorize reconciliation is ledger-based.** The `embedding_state` D1 table
  is the authoritative mapping of chunk ids to vector ids. There is no full
  Vectorize index scan API, so orphaned vectors can only be found by
  cross-referencing the ledger. `GET /v1/kb/verify` spot-checks a sample but
  does not scan the full index.
- **BG3 live crawling is manual and best-effort.** There is no scheduled crawl
  job. Re-crawls must be triggered manually via `pnpm crawl`. Stale content
  between crawls is expected.
- **`database_id` placeholder in `wrangler.toml`.** The checked-in value is
  `00000000-0000-0000-0000-000000000000`. A remote deploy with the placeholder
  will fail. Replace it with the real UUID from `wrangler d1 create reyn_kb`.
