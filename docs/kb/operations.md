# Reyn Knowledge Base — operations

## Local development

```bash
cd apps/reyn-kb-worker
pnpm install                                    # from repo root, once
pnpm exec wrangler d1 migrations apply reyn_kb --local   # schema + FTS5 + triggers
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage
```

Vectorize and Workers AI have **no local emulator**. Two options:
- **Tests / mock end-to-end** — the vitest config pins `EMBEDDING_PROVIDER`/`VECTOR_INDEX`
  to `mock` and `OBJECT_STORE` to `r2` (R2 has a local emulator). The suite never touches
  live Cloudflare. The mock vector index models metadata filtering + namespaces so retrieval
  is fully testable offline.
- **Live dev** — `pnpm exec wrangler dev --remote` talks to real Vectorize + Workers AI.

### Mock end-to-end (zero external calls)

```
POST /v1/kb/sources → POST /v1/kb/pages (raw HTML, rules run)
  → POST /v1/kb/pages/:id/index
  → POST /v1/kb/search {"query":"…","filters":{"pageTypes":["spell"]},"expand":true}
  → GET  /v1/kb/verify   (expect ok:true, zero drift)
```

## One-time production bootstrap

Done **once, by hand** (account-shaping / not idempotent-friendly), before the first deploy:

```bash
cd apps/reyn-kb-worker
# 1. D1 database — paste the printed id into wrangler.toml's [[d1_databases]].database_id
pnpm exec wrangler d1 create reyn_kb
# 2. R2 bucket for raw HTML / markdown / images
pnpm exec wrangler r2 bucket create reyn-kb-content
```

The Vectorize index + its **6 metadata indexes** are created by the deploy workflow (below)
— they must exist **before the first ingest** because Vectorize metadata indexes are not
retroactive ([ADR-0022](../adr/0022-vectorize-metadata-namespaces-supersede.md)).

## Deploy (`workflow_dispatch` only)

`.github/workflows/deploy-kb-worker.yml` is manual-only ([ADR-0010](../adr/0010-ci-cd-github-actions.md)).
It: applies `reyn_kb` migrations `--remote` → creates the Vectorize index
(`reyn-kb-bge-base`, 768-dim cosine) + the 6 metadata indexes (`source_tier`, `page_type`,
`lifecycle`, `language`, `source_id`, `crawled_at`) idempotently → pushes the
`KB_INGEST_KEY` secret → `wrangler deploy`.

**Required GitHub environment secrets** (in `Reynguides/monorepo`):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `KB_INGEST_KEY`.

Never run `--remote` migrations from a laptop — use the workflow.

## Adding a migration

Add SQL to `migrations/kb-d1/`, then:

```bash
pnpm exec wrangler d1 migrations apply reyn_kb --local   # dev
# production: via the Deploy KB Worker workflow only.
```

## Monitoring (verify & stats)

- **`GET /v1/kb/verify`** — cross-store reconciliation: chunks lacking an embedding, orphan
  ledger rows, namespace drift, dangling edges/`chunk_images`, FTS5 consistency
  (`integrity-check rank=1`), and pages with unresolved validation failures. `ok:true` means
  structural integrity is clean. Run after large ingests / migrations.
- **`GET /v1/kb/stats`** — corpus counts + page-lifecycle breakdown. A cheap health/dashboard
  snapshot.
- **Structured logs** — the index and search boundaries emit single-line JSON
  (`{"level","event":"kb.index"|"kb.search",…}`) visible via `wrangler tail` / Workers Logs.

## Populating the KB

See [crawler](crawler.md): `KB_INGEST_KEY=… pnpm crawl --source bg3-wiki --limit N` against
`wrangler dev --remote`.

## Known caveat — Windows test flake

On Windows, `@cloudflare/vitest-pool-workers` intermittently logs `EBUSY: resource busy or
locked` while removing `miniflare-*` temp dirs (cleanup noise; tests still pass). If a run
fails with `ERR_RUNTIME_FAILURE`, kill stale `workerd`/`wrangler` processes, clear
`%TEMP%\miniflare-*`, and re-run the suite solo. CI (ubuntu) is unaffected.
