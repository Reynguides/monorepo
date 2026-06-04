# ADR-0017: Knowledge Base as a separate Worker, built platform-first with D1 FTS5

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

A prior PoC put a knowledge base inside `apps/reyn-rag-worker` (branch `feat/poc2-rag-infra`). It is disciplined code but the KB is shallow in scope: pages are flat blobs, there are no relationships between pages, no explicit rules layer, search is semantic-only (no full-text/structured/filtered), and Vectorize metadata is written but never used for filtering. We want a mature, production-grade **KB engine + indexing + retrieval/search API** — and only that; LLM answer generation (RAG chat) is explicitly out of scope and is a future *consumer* of this search API.

Constraints are locked: BG3-only (no `game_id`); Cloudflare serverless only (Workers + D1 + R2 + Vectorize + Workers AI `@cf/baai/bge-base-en-v1.5`, 768-dim); the same quality bar as the rest of Reyn (strict TS, 95/95/95/90 coverage, ADRs, docs, CI). The two existing workers (`reyn-cloud-worker`, `reyn-rag-worker`) ship with **only `hono` + `zod`** as runtime dependencies, and the Workers platform imposes a ~1 MB compressed bundle limit.

The central question is **build vs. adapt**: hand-roll, or adopt Workers-compatible open-source libraries (Drizzle ORM, `@mozilla/readability`+`linkedom`, `@langchain/textsplitters`, `js-tiktoken`)? Research confirmed those libraries run on Workers but add ~6 dependencies, real bundle-size risk, and — for Drizzle — a third data-access pattern in the monorepo.

## Decision

1. **A new worker `apps/reyn-kb-worker`**, branched from `master` (which contains neither the rag PoC nor its ADRs 0011–0016). The rag PoC is reference-only and treated as superseded. A clean worker keeps the structured schema uncontaminated and drops the LLM path entirely. ADR numbering starts at **0017** to avoid collision with the rag branch's 0010–0016 if the branches ever merge.

2. **Platform-first, minimal-dependency build for the Worker.** Inside the Worker we hand-roll (repos as D1 prepared statements, the rules engine, relationship extraction, RRF fusion, scoring) and adopt only **Cloudflare platform features**, which carry no npm dependency or bundle cost:
   - **HTMLRewriter** for HTML content extraction (see [[adr-0018-htmlrewriter-content-extraction]]).
   - **D1 FTS5** virtual tables for keyword/BM25 search, enabling hybrid retrieval (see [[adr-0023-hybrid-rrf-retrieval]]).
   - **Vectorize metadata indexes + namespaces** for server-side structured filtering (see [[adr-0022-vectorize-metadata-supersede]]).
   The Worker keeps **`hono` + `zod` as its only runtime dependencies**.

3. **The single adopted open-source library is the ingestion crawler (Crawlee)** — and it lives in a Node-side producer tool (`tools/crawl.ts`), **outside the Worker runtime and bundle** (see [[adr-0024-crawlee-ingestion-crawler]]). It therefore does not affect the Worker's minimal-dependency stance or the bundle limit.

4. **D1 FTS5 is adopted with eyes open**: FTS5 virtual tables cannot be included in D1 `export`. R2 (raw HTML + cleaned markdown) and the `embedding_state` ledger are the source of truth; the FTS index is derived and recreate-on-restore.

## Consequences

**Positive**
- Consistency with the existing two workers — one mental model (hand-rolled repos, provider/factory seams, `hono`+`zod`), no new ORM/codegen step, no bundle-size spike to manage.
- No library lock-in inside the Worker; swapping an approach is a localized change behind a seam.
- Most of the maturity uplift (full-text, structured filtering, real DOM extraction) comes from platform features that are free of dependency cost.

**Negative**
- More hand-rolled surface to test to hold the 95/95/95/90 gate (mitigated: the engine pieces are pure functions, trivially unit-tested).
- FTS5 blocks D1 `export`; backups rely on R2 + the ledger as source of truth and recreate the FTS table on restore.

**Neutral**
- The higher-quality library options (Readability, Drizzle) remain available later behind seams if a concrete need and a passing bundle spike justify them.

## Alternatives considered

- **Adopt the mature library stack** (Drizzle + Readability/linkedom + langchain-textsplitters + js-tiktoken) — rejected for the Worker: ~6 new deps, real bundle-size risk against the 1 MB limit, and a third data-access pattern in a monorepo that elsewhere hand-rolls. Kept as a future option behind seams.
- **Rewrite the rag worker in place** — rejected: entangles the new KB with the superseded PoC's history, flat schema, and LLM path.
- **Cloudflare AutoRAG (managed)** — rejected: it is a managed product, not open-source code to adapt, and the brief excludes buying a managed solution.
- **A non-Cloudflare crawler/runtime** — rejected: the stack is locked to Cloudflare serverless; only the developer-run crawler tool runs on Node (it is not deployed).

## Verification

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` green in `apps/reyn-kb-worker`; `wrangler dev --once` boots and `GET /v1/health` returns 200 (P0).
- From P1 onward: `wrangler d1 migrations apply reyn_kb --local` applies the schema including the FTS5 virtual table + triggers; a keyword search returns BM25-ranked rows.
- The built Worker bundle never includes `crawlee` (P9/P10 check).

## References

- [[adr-0018-htmlrewriter-content-extraction]], [[adr-0022-vectorize-metadata-supersede]], [[adr-0023-hybrid-rrf-retrieval]], [[adr-0024-crawlee-ingestion-crawler]] — the decisions this one frames.
- [[adr-0009-strict-ts-and-net-quality-gates]], [[adr-0010-ci-cd-github-actions]] — the quality + CI gates inherited.
- Cloudflare D1 SQL (FTS5 support): <https://developers.cloudflare.com/d1/sql-api/sql-statements/>
- Vectorize metadata filtering: <https://developers.cloudflare.com/vectorize/reference/metadata-filtering/>
- Workers bundle limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Plan: `lively-wibbling-locket` (KB engine + search API).
