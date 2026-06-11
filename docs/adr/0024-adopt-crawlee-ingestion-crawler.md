# ADR-0024: Adopt Crawlee as the ingestion crawler — a Node producer outside the Worker

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: the prior hand-rolled crawler (rated unsatisfactory)
- **Superseded by**: n/a

## Context

The KB needs to be *populated* — something must discover BG3 wiki pages and feed them
to the ingestion API (`POST /v1/kb/sources` then `POST /v1/kb/pages`). The previous
PoC hand-rolled sitemap parsing, robots.txt handling, and rate-limiting; that crawler
was explicitly rated unsatisfactory. The build-vs-adapt decision (ADR-0017) is
**platform-first + hand-roll inside the Worker**, but it carved out one exception: the
crawler should be a **ready-made open-source library**, not hand-rolled and not the
Cloudflare-native `/crawl` (too capped). The constraint is that adopting a heavy
library must not contaminate the Worker's minimal-deps stance (only `hono` + `zod`) or
its ~1 MB bundle.

## Decision

1. **Adopt [Crawlee](https://crawlee.dev) (Apify, Apache-2.0, TypeScript-first)** as the
   ingestion crawler. It gives us, off the shelf: `Sitemap.load` (follows nested sitemap
   indices), `RobotsFile.find`/`isAllowed` (robots.txt compliance),
   `maxRequestsPerMinute`/`maxConcurrency` (politeness), a request queue (dedup, retries,
   **named → resumable** runs), and `CheerioCrawler` (static MediaWiki HTML; no headless
   browser needed).
2. **Run it as a Node-side producer tool, `tools/crawl.ts`** (`pnpm crawl`, executed via
   `tsx`), *outside* the Worker runtime. It fetches each page's raw HTML and POSTs it to
   the ingestion API with the `KB_INGEST_KEY` bearer; the source is registered first
   (idempotent). `crawlee` + `tsx` are **devDependencies of the worker app only**.
3. **Keep all domain logic pure + in `src/lib/sources.ts`** — the source-tier catalog,
   the crawl filter (`shouldIngest`: origin + path-prefix + MediaWiki-namespace
   exclusion), and the request-body builders (`toSourceRegistration`, `toPageRequest`).
   `tools/crawl.ts` is a thin wiring shell that imports these. `src/` **never** imports
   `crawlee`, so the library is absent from the built Worker bundle (verified by a
   `wrangler deploy --dry-run` grep).

## Consequences

**Positive**
- Battle-tested crawl mechanics (sitemaps, robots, backoff, retries, resumable queues)
  instead of fragile hand-rolled code — the exact gap the prior crawler was faulted for.
- The Worker stays minimal: `crawlee` is a devDependency imported only from `tools/`, so
  the deploy bundle is unchanged (~282 KB, no `crawlee`/`cheerio`).
- The pure mapping core (`src/lib/sources.ts`) is unit-tested under the 95/95/95/90 gate;
  the wiring shell is coverage-excluded (it's `tools/`, not `src/`).

**Negative**
- A large devDependency tree (Crawlee pulls cheerio, jsdom, etc.). It's dev-only and
  never shipped, but it grows `node_modules` and CI install time. *(Materializing it also
  surfaced two latent type incompatibilities in existing files against the current
  `@types/node`/workers-types — fixed in the same change; they were not Crawlee bugs.)*
- The crawl tool itself isn't exercised in CI (it needs live network + `wrangler dev
  --remote`); it's developer-run and smoke-tested offline. The risk is bounded because all
  decisioned logic lives in the tested `src/lib/sources.ts`.

**Neutral**
- The crawler targets static MediaWiki HTML via `CheerioCrawler`; a JS-rendered source
  would need `PlaywrightCrawler` (also in Crawlee) — a future per-source option.

## Verification

- `sources.test.ts` — catalog lookup, the crawl filter (origin/prefix/namespace/invalid
  URL/invalid base/empty-prefix), and both request builders.
- `wrangler deploy --dry-run` bundle contains **no** `crawlee`/`CheerioCrawler` symbol.
- Developer-run: `KB_INGEST_KEY=… pnpm crawl --source bg3-wiki --limit 5` against
  `wrangler dev --remote` → rows appear via `GET /v1/kb/pages`.

## References

- [[adr-0017-platform-first-kb-worker-fts5]] — the minimal-deps stance this carves an
  exception to (crawler only, dev-only, outside the bundle).
- The Knowledge Base implementation plan (Phase 9).
