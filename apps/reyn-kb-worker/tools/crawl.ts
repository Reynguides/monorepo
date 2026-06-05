/**
 * Ingestion producer (ADR-0024). A thin Node-side wiring shell around **Crawlee**
 * (Apache-2.0): discover URLs from the source sitemap, honour robots.txt, crawl
 * politely (rate-limited, deduped, resumable via a named request queue), and POST
 * each page's raw HTML to the KB ingestion API. All domain logic — the source
 * catalog, the crawl filter, and the request bodies — lives in `src/lib/sources.ts`
 * (pure + unit-tested); Crawlee is a devDependency that never enters the Worker
 * bundle (it is imported only from this `tools/` file, never from `src/`).
 *
 * Run:  KB_INGEST_KEY=… pnpm crawl --source bg3-wiki --api http://127.0.0.1:8787 --limit 5
 * (against `wrangler dev --remote`, since Vectorize/Workers AI have no local emulator).
 */
import { argv, env } from "node:process";
import { CheerioCrawler, RequestQueue, RobotsFile, Sitemap, log } from "crawlee";
import {
  SOURCE_CATALOG,
  getSource,
  shouldIngest,
  toPageRequest,
  toSourceRegistration,
  type SourceDef,
} from "../src/lib/sources.ts";

interface CrawlOptions {
  source: SourceDef;
  apiBase: string;
  limit: number;
  ingestKey: string;
}

function readFlag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? "25");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 25;
}

function parseOptions(args: readonly string[]): CrawlOptions {
  const sourceId = readFlag(args, "source") ?? "bg3-wiki";
  const source = getSource(sourceId);
  if (source === undefined) {
    const known = SOURCE_CATALOG.map((s) => s.id).join(", ");
    throw new Error(`Unknown source '${sourceId}'. Known sources: ${known}`);
  }
  const ingestKey = env.KB_INGEST_KEY ?? "";
  if (ingestKey.length === 0) throw new Error("KB_INGEST_KEY environment variable is required");
  return {
    source,
    apiBase: readFlag(args, "api") ?? "http://127.0.0.1:8787",
    limit: parseLimit(readFlag(args, "limit")),
    ingestKey,
  };
}

async function postJson(url: string, ingestKey: string, body: unknown): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ingestKey}` },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function discoverUrls(source: SourceDef, limit: number): Promise<string[]> {
  const sitemap = await Sitemap.load(source.sitemapUrl);
  const robots = await RobotsFile.find(source.baseUrl);
  const allowed = sitemap.urls.filter((u) => shouldIngest(u, source) && robots.isAllowed(u));
  return allowed.slice(0, limit);
}

async function run(): Promise<void> {
  const opts = parseOptions(argv.slice(2));
  log.info(`crawl start: source=${opts.source.id} api=${opts.apiBase} limit=${opts.limit}`);

  const sourceStatus = await postJson(
    `${opts.apiBase}/v1/kb/sources`,
    opts.ingestKey,
    toSourceRegistration(opts.source),
  );
  log.info(`registered source '${opts.source.id}' -> HTTP ${sourceStatus}`);

  const urls = await discoverUrls(opts.source, opts.limit);
  log.info(`discovered ${urls.length} ingestable URL(s)`);

  const requestQueue = await RequestQueue.open(opts.source.id);
  const crawler = new CheerioCrawler({
    requestQueue,
    maxRequestsPerMinute: 30,
    maxConcurrency: 2,
    async requestHandler({ request, body, $ }) {
      const html = typeof body === "string" ? body : body.toString("utf8");
      const title = ($("h1").first().text() || $("title").first().text()).trim().slice(0, 500);
      const status = await postJson(
        `${opts.apiBase}/v1/kb/pages`,
        opts.ingestKey,
        toPageRequest(opts.source, request.url, html, title),
      );
      log.info(`ingested ${request.url} -> HTTP ${status} (title: ${title || "<none>"})`);
    },
  });

  await crawler.run(urls);
  log.info("crawl complete");
}

await run();
