# Reyn Knowledge Base — crawler

The KB is populated by a **ready-made crawler ([Crawlee](https://crawlee.dev), Apache-2.0)**
run as a Node-side producer tool, `apps/reyn-kb-worker/tools/crawl.ts`
([ADR-0024](../adr/0024-adopt-crawlee-ingestion-crawler.md)). It is **not** hand-rolled and
**not** the capped Cloudflare-native `/crawl`.

## How it works

1. Resolve the source from the catalog (`src/lib/sources.ts`).
2. Register the source (idempotent) — `POST /v1/kb/sources`.
3. `Sitemap.load(source.sitemapUrl)` — follows nested sitemap indices.
4. `RobotsFile.find(source.baseUrl)` — honour `robots.txt` (`isAllowed`).
5. Filter URLs with `shouldIngest` (same origin + allowed path prefix + MediaWiki
   namespace exclusion: `Special:`/`Talk:`/`Category:`/`File:`/`Template:`/…), then cap at
   `--limit`.
6. Crawl politely with `CheerioCrawler` — `maxRequestsPerMinute: 30`, `maxConcurrency: 2`,
   retries, dedup, and a **named, resumable `RequestQueue`** (keyed by source id).
7. For each page, `POST /v1/kb/pages` with the raw HTML, the source's default `pageType`, and
   the cleaned `<title>` — a source may set `titleSuffix` (regex) to strip site-name noise
   from the title (`game8` uses it; `cleanPageTitle` in `sources.ts` is pure + unit-tested).

The worker then indexes each page on demand (`POST /v1/kb/pages/:id/index`).

## Run it

```bash
cd apps/reyn-kb-worker
# Against a remote dev session (Vectorize/Workers AI have no local emulator):
pnpm exec wrangler dev --remote          # one terminal
KB_INGEST_KEY=<key> pnpm crawl --source bg3-wiki --api http://127.0.0.1:8787 --limit 5
# verify rows landed:
curl 'http://127.0.0.1:8787/v1/kb/pages?source=bg3-wiki'
```

Flags: `--source` (default `bg3-wiki`), `--api` (default `http://127.0.0.1:8787`),
`--limit` (default 25), `--rpm` (default 30), `--concurrency` (default 2).
`KB_INGEST_KEY` is read from the environment.

## Design split — pure core vs. wiring shell

- **`src/lib/sources.ts`** holds all decisioned logic and is **unit-tested under the
  coverage gate**: the source-tier catalog, `getSource`, the crawl filter `shouldIngest`,
  and the request-body builders `toSourceRegistration` / `toPageRequest`.
- **`tools/crawl.ts`** is a thin Crawlee wiring shell. It is **coverage-excluded** (it needs
  live network + `wrangler dev --remote`, which CI can't run) but is still type-checked and
  linted under the full strict ruleset.

## Bundle isolation

`crawlee` + `tsx` are **devDependencies**. `src/` never imports `crawlee` — only `tools/`
does — so the library is **absent from the deployed Worker bundle**. Verified by
`wrangler deploy --dry-run` (the emitted `index.js` contains no `crawlee`/`CheerioCrawler`
symbol). This preserves the Worker's minimal-deps stance
([ADR-0017](../adr/0017-knowledge-base-worker-platform-first.md)).

## Source catalog

| id | base | tier | license | sitemap |
|---|---|---|---|---|
| `bg3-wiki` | `https://bg3.wiki` | 1 | CC BY-SA 4.0 | `https://bg3.wiki/sitemap.xml` |
| `fextralife` | `https://baldursgate3.wiki.fextralife.com` | 2 | fan wiki (testing only) | `…/sitemap.xml` (flat urlset) |
| `gamerguides` | `https://www.gamerguides.com` | 3 | commercial (testing only) | `…/sitemap/1/300` (BG3-dense chunk) |
| `game8` | `https://game8.co` | 3 | commercial (testing only) | `…/sitemaps/game_1237.xml.gz` (BG3-only per-game) |

`game8`'s sitemap index splits per game, so the catalog points at the single BG3 per-game
`.gz` (game 1237) rather than the all-games index, and `allowPathPrefixes: ["/games/BG3/"]`
keeps it BG3-only. game8 leaves `<h1>` empty, so its entry sets `titleSuffix` to strip the
`<title>` site-name tail (see title cleaning below).

Add a source by appending a `SourceDef` to `SOURCE_CATALOG` in `src/lib/sources.ts` (and a
test). A JS-rendered source would need Crawlee's `PlaywrightCrawler` instead of
`CheerioCrawler` — a future per-source option.
