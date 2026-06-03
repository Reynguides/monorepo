# ADR-0011: Build the RAG knowledge-base as a separate Cloudflare worker (`reyn-rag-worker`)

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

PoC 2 adds a RAG knowledge base (crawl BG3 wiki sources → store → embed → vector search → cited Q&A) that a future, out-of-scope wiki website will consume. The existing `apps/reyn-cloud-worker` is the auth + event-sync worker: it owns the Accounts D1, session auth, and the sync push/pull endpoints, with its own 95%-coverage surface and a `workflow_dispatch` deploy.

The RAG backend has a different binding set (Workers AI, Vectorize, R2, AI Gateway), a different lifecycle (crawl/ingest/index), no dependency on user accounts, and a different failure domain. We must decide whether it lives inside the existing worker or as a new one.

## Decision

Create a **new, isolated worker `apps/reyn-rag-worker`** that **mirrors** `reyn-cloud-worker`'s conventions — Hono + Zod, `@cloudflare/vitest-pool-workers`, the env-var-selected factory pattern ([[adr-0002-per-user-d1-via-rest-api]]), a thin `repo/` D1 layer, and the same strict quality gates (≥95/95/95/90). It has its own `wrangler.toml`, bindings (`KB_DB`, `KB_BUCKET`, `VECTORIZE`, `AI`), test suite, and `deploy-rag-worker.yml` (`workflow_dispatch`-only per [[adr-0010-ci-cd-github-actions]]).

## Consequences

**Positive**
- Zero risk to the auth/sync worker; its coverage surface and bindings stay clean.
- Independent deploy, scaling, and failure domain.
- New AI/Vectorize/R2 bindings don't leak into the auth worker's tests.

**Negative**
- A second worker package to maintain; some scaffolding (eslint/prettier/tsconfig/vitest) is duplicated.

**Neutral**
- The convention-mirroring keeps cognitive load low: anyone who knows `reyn-cloud-worker` knows this one.

## Alternatives considered

- **Extend `reyn-cloud-worker`.** Rejected — couples unrelated bindings, bloats the auth worker's coverage surface, and mixes a public reference-data concern with per-user account data.
- **A non-Worker Node service.** Rejected — leaves the Cloudflare-native stack (D1/R2/Vectorize/Workers AI) the rest of Reyn standardised on.

## Verification

- `apps/reyn-rag-worker` builds and tests independently: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage`.
- A new `rag-worker` CI job mirrors the `worker` job; the existing worker job is unaffected.

## References

- [[adr-0001-monorepo-rename-reyn]] — monorepo layout (`apps/*`).
- [[adr-0010-ci-cd-github-actions]] — deploy is `workflow_dispatch`-only.
