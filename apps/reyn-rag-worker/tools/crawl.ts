/**
 * Manual/dev crawler CLI — NOT run in CI and intentionally NOT coverage-gated
 * (vitest coverage `include` is `src/**` only). It's a thin wiring shell around
 * the pure pipeline in `src/crawl/`: every piece of real I/O (fetch, robots,
 * rate-limit, sink, crawl-state) is constructed here and injected into
 * `crawlSource`, which holds all the testable logic.
 *
 * Usage:
 *   RAG_BASE_URL=https://reyn-rag.example.workers.dev \
 *   KB_INGEST_KEY=... \
 *   pnpm crawl --source bg3-wiki --limit 50
 *
 * It POSTs each crawled page to the Worker's ingest API and persists crawl
 * progress through the Worker's crawl-state endpoints, so a re-run resumes.
 */
import process from "node:process";
import { getSourceById, type Source } from "../src/lib/sources.ts";
import { parseRobots } from "../src/crawl/robots.ts";
import { RateLimiter } from "../src/crawl/rate-limit.ts";
import { crawlSource, type CrawlPage, type FetchResponse } from "../src/crawl/pipeline.ts";
import { CrawlStateResponse } from "../src/schemas/crawl.ts";

const USER_AGENT = "ReynBot/0.1 (+https://github.com/reyn; BG3 RAG PoC)";
const DEFAULT_INTERVAL_MS = 1000;
/** bg3.wiki / MediaWiki + most sites expose the sitemap at the site root. */
const SITEMAP_PATH = "/sitemap.xml";

interface Args {
  source: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  let source: string | undefined;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source") {
      source = argv[++i];
    } else if (arg === "--limit") {
      const raw = argv[++i];
      const n = Number.parseInt(raw ?? "", 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  if (source === undefined || source.length === 0) {
    throw new Error("Usage: pnpm crawl --source <id> [--limit <n>]");
  }
  return limit === undefined ? { source } : { source, limit };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/** Adapts the global fetch to the pipeline's minimal FetchResponse shape. */
async function httpFetch(url: string): Promise<FetchResponse> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  return { status: res.status, text: () => res.text() };
}

/** Fetch + parse the source's robots.txt (fail-open: a fetch error allows all). */
async function loadRobots(source: Source): Promise<ReturnType<typeof parseRobots>> {
  try {
    const res = await fetch(new URL("/robots.txt", source.baseUrl), {
      headers: { "User-Agent": USER_AGENT },
    });
    const text = res.status >= 200 && res.status < 300 ? await res.text() : "";
    return parseRobots(text, USER_AGENT);
  } catch {
    return parseRobots("", USER_AGENT);
  }
}

function makeSink(baseUrl: string, ingestKey: string): (page: CrawlPage) => Promise<void> {
  return async (page) => {
    const res = await fetch(new URL("/v1/kb/pages", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ingestKey}` },
      body: JSON.stringify({
        sourceId: page.sourceId,
        url: page.url,
        html: page.html,
        ...(page.title !== undefined ? { title: page.title } : {}),
      }),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Ingest POST failed for ${page.url}: ${String(res.status)}`);
    }
  };
}

/**
 * Registers the catalog source with the Worker before crawling. Idempotent:
 * the Worker keys on the explicit `id`, so re-runs are a no-op (200). Without
 * this, `POST /v1/kb/pages` 404s because no `sources` row exists for the
 * catalog id the crawler stamps onto each page.
 */
async function registerSource(baseUrl: string, ingestKey: string, source: Source): Promise<void> {
  const res = await fetch(new URL("/v1/kb/sources", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ingestKey}` },
    body: JSON.stringify({
      id: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      tier: source.tier,
    }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Source registration failed for ${source.id}: ${String(res.status)}`);
  }
}

function makeCrawlState(baseUrl: string, ingestKey: string, sourceId: string) {
  return {
    async getCursor(): Promise<number> {
      const res = await fetch(new URL(`/v1/kb/crawl-state/${sourceId}`, baseUrl));
      if (res.status === 404) return 0;
      const parsed = CrawlStateResponse.safeParse(await res.json());
      return parsed.success ? parsed.data.cursor : 0;
    },
    async setCursor(cursor: number): Promise<void> {
      await fetch(new URL("/v1/kb/crawl-state", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ingestKey}` },
        body: JSON.stringify({
          sourceId,
          cursor,
          status: "crawling",
          lastSitemapAt: Date.now(),
        }),
      });
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = getSourceById(args.source);
  if (source === null) {
    throw new Error(`Unknown source id: ${args.source}`);
  }
  const baseUrl = requireEnv("RAG_BASE_URL");
  const ingestKey = requireEnv("KB_INGEST_KEY");

  // Register the source first (idempotent) so page writes don't 404 on a
  // missing `sources` row. Pages are stamped with `source.id` below.
  await registerSource(baseUrl, ingestKey, source);

  const robots = await loadRobots(source);
  const minIntervalMs = robots.crawlDelayMs > 0 ? robots.crawlDelayMs : DEFAULT_INTERVAL_MS;
  const rateLimiter = new RateLimiter({
    now: () => Date.now(),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    minIntervalMs,
  });

  const result = await crawlSource({
    source,
    fetcher: httpFetch,
    sink: makeSink(baseUrl, ingestKey),
    robots,
    rateLimiter,
    crawlState: makeCrawlState(baseUrl, ingestKey, source.id),
    sitemapUrl: new URL(SITEMAP_PATH, source.baseUrl).toString(),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });

  process.stdout.write(
    `Crawled ${String(result.crawled)} page(s), skipped ${String(result.skipped)} from ${source.id}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
