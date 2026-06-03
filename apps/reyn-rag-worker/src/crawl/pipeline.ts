/**
 * The crawl pipeline (pure orchestration: every I/O is an injected dependency,
 * so it's unit-tested with no network/timers). Runs as a Node CLI step
 * (tools/crawl.ts) against the Worker's HTTP API — it never executes inside the
 * Worker.
 *
 * Flow: fetch + parse the sitemap → keep only URLs whose host equals
 * `source.host` (SSRF guard — off-host locs are dropped) AND that robots.txt
 * allows → resume from the persisted cursor → for each remaining URL (capped by
 * `limit`): rate-limit, fetch, and on a 2xx hand the raw HTML to `sink`; then
 * advance + persist the cursor. Non-2xx fetches and filtered URLs count as
 * skipped.
 */
import { parseSitemap } from "./sitemap.ts";
import type { Source } from "../lib/sources.ts";

export interface CrawlPage {
  sourceId: string;
  url: string;
  title?: string;
  html: string;
}

export interface FetchResponse {
  status: number;
  text(): Promise<string>;
}

export interface CrawlOptions {
  source: Source;
  /** Fetches a URL. Injected so tests never hit the network. */
  fetcher: (url: string) => Promise<FetchResponse>;
  /** Persists one crawled page (e.g. POST /v1/kb/pages). */
  sink: (page: CrawlPage) => Promise<void>;
  robots: { isAllowed(path: string): boolean };
  rateLimiter: { wait(): Promise<void> };
  /** Resume bookkeeping: cursor = index into the filtered URL list. */
  crawlState: {
    getCursor(): Promise<number>;
    setCursor(n: number): Promise<void>;
  };
  sitemapUrl: string;
  /** Max pages to fetch this run; undefined = no cap (whole remainder). */
  limit?: number;
}

export interface CrawlResult {
  crawled: number;
  skipped: number;
}

/**
 * Crawl one source's sitemap. Returns counts: `crawled` = pages handed to the
 * sink (2xx); `skipped` = URLs dropped by the host/robots filter plus pages
 * whose fetch returned a non-2xx status within this run's window.
 */
export async function crawlSource(opts: CrawlOptions): Promise<CrawlResult> {
  const allUrls = await fetchSitemapUrls(opts);

  // Filter: same-host (SSRF guard) AND robots-allowed. Dropped URLs are skipped.
  const allowed: string[] = [];
  let skipped = 0;
  for (const url of allUrls) {
    if (isCrawlable(url, opts.source.host, opts.robots)) {
      allowed.push(url);
    } else {
      skipped += 1;
    }
  }

  const start = await opts.crawlState.getCursor();
  const end =
    opts.limit === undefined ? allowed.length : Math.min(allowed.length, start + opts.limit);

  let crawled = 0;
  for (let i = start; i < end; i++) {
    const url = allowed[i];
    /* istanbul ignore next -- i is bounded by allowed.length; guard narrows the
       noUncheckedIndexedAccess `string | undefined` only. */
    if (url === undefined) continue;

    await opts.rateLimiter.wait();
    const res = await opts.fetcher(url);
    if (res.status >= 200 && res.status < 300) {
      const html = await res.text();
      const title = extractTitle(html);
      await opts.sink({
        sourceId: opts.source.id,
        url,
        html,
        ...(title !== null ? { title } : {}),
      });
      crawled += 1;
    } else {
      skipped += 1;
    }
    // Persist progress after every URL so a crash resumes at the next one.
    await opts.crawlState.setCursor(i + 1);
  }

  return { crawled, skipped };
}

/** Fetch the sitemap and parse out its `<loc>` URLs (empty on non-2xx). */
async function fetchSitemapUrls(opts: CrawlOptions): Promise<string[]> {
  const res = await opts.fetcher(opts.sitemapUrl);
  if (res.status < 200 || res.status >= 300) {
    return [];
  }
  return parseSitemap(await res.text());
}

/** Same-host (SSRF) + robots gate for a single sitemap URL. */
function isCrawlable(
  url: string,
  host: string,
  robots: { isAllowed(p: string): boolean },
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // unparseable loc — drop it.
  }
  if (parsed.host.toLowerCase() !== host.toLowerCase()) {
    return false; // off-host → SSRF guard drops it.
  }
  return robots.isAllowed(parsed.pathname);
}

/** Pull the trimmed `<title>` text from an HTML string, or null if absent. */
function extractTitle(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (m?.[1] === undefined) return null;
  const title = m[1].trim();
  return title.length > 0 ? title : null;
}
