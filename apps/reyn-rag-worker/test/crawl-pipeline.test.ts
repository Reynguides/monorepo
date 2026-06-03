import { describe, expect, it } from "vitest";
import { crawlSource, type CrawlOptions, type CrawlPage } from "../src/crawl/pipeline.ts";
import type { Source } from "../src/lib/sources.ts";

const SOURCE: Source = {
  id: "bg3-wiki",
  name: "BG3 Wiki",
  baseUrl: "https://bg3.wiki",
  host: "bg3.wiki",
  tier: 1,
};

const SITEMAP_URL = "https://bg3.wiki/sitemap.xml";

function sitemapXml(urls: string[]): string {
  return `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
}

/** Build a fetcher from a map of url → {status, body}. Unknown URLs → 404. */
function makeFetcher(responses: Record<string, { status: number; body: string }>) {
  const calls: string[] = [];
  const fetcher: CrawlOptions["fetcher"] = (url) => {
    calls.push(url);
    const r = responses[url] ?? { status: 404, body: "" };
    return Promise.resolve({ status: r.status, text: () => Promise.resolve(r.body) });
  };
  return { fetcher, calls };
}

/** In-memory crawl-state with a numeric cursor. */
function makeCrawlState(initial = 0) {
  let cursor = initial;
  const writes: number[] = [];
  return {
    writes,
    get cursor() {
      return cursor;
    },
    state: {
      getCursor: () => Promise.resolve(cursor),
      setCursor: (n: number) => {
        cursor = n;
        writes.push(n);
        return Promise.resolve();
      },
    },
  };
}

const ALLOW_ALL = { isAllowed: () => true };
const NO_WAIT = { wait: () => Promise.resolve() };

function makeSink() {
  const pages: CrawlPage[] = [];
  return { pages, sink: (p: CrawlPage) => (pages.push(p), Promise.resolve()) };
}

describe("crawlSource", () => {
  it("crawls every same-host, robots-allowed URL and hands raw html to the sink", async () => {
    const urls = ["https://bg3.wiki/A", "https://bg3.wiki/B"];
    const { fetcher } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/A": { status: 200, body: "<title>A</title><h1>A</h1>" },
      "https://bg3.wiki/B": { status: 200, body: "<h1>B</h1>" },
    });
    const { pages, sink } = makeSink();
    const cs = makeCrawlState();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: cs.state,
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 2, skipped: 0 });
    expect(pages.map((p) => p.url)).toEqual(urls);
    expect(pages[0]).toMatchObject({ sourceId: "bg3-wiki", title: "A" });
    // Page B has no <title> → title omitted entirely.
    expect(pages[1]!.title).toBeUndefined();
    expect(cs.cursor).toBe(2);
  });

  it("drops off-host URLs (SSRF guard) and counts them as skipped", async () => {
    const urls = ["https://bg3.wiki/Good", "https://evil.test/Bad", "not a url"];
    const { fetcher, calls } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/Good": { status: 200, body: "<h1>Good</h1>" },
    });
    const { pages, sink } = makeSink();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: makeCrawlState().state,
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 1, skipped: 2 });
    expect(pages.map((p) => p.url)).toEqual(["https://bg3.wiki/Good"]);
    // The off-host + unparseable URLs were never fetched.
    expect(calls).toEqual([SITEMAP_URL, "https://bg3.wiki/Good"]);
  });

  it("skips robots-disallowed paths", async () => {
    const urls = ["https://bg3.wiki/ok", "https://bg3.wiki/private/secret"];
    const { fetcher } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/ok": { status: 200, body: "<h1>ok</h1>" },
    });
    const { pages, sink } = makeSink();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: { isAllowed: (p) => !p.startsWith("/private") },
      rateLimiter: NO_WAIT,
      crawlState: makeCrawlState().state,
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 1, skipped: 1 });
    expect(pages.map((p) => p.url)).toEqual(["https://bg3.wiki/ok"]);
  });

  it("counts a non-2xx page fetch as skipped (no sink call) but still advances the cursor", async () => {
    const urls = ["https://bg3.wiki/A", "https://bg3.wiki/B"];
    const { fetcher } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/A": { status: 500, body: "boom" },
      "https://bg3.wiki/B": { status: 200, body: "<h1>B</h1>" },
    });
    const { pages, sink } = makeSink();
    const cs = makeCrawlState();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: cs.state,
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 1, skipped: 1 });
    expect(pages.map((p) => p.url)).toEqual(["https://bg3.wiki/B"]);
    expect(cs.cursor).toBe(2); // cursor advanced past both
  });

  it("resumes from the persisted cursor", async () => {
    const urls = ["https://bg3.wiki/A", "https://bg3.wiki/B", "https://bg3.wiki/C"];
    const { fetcher, calls } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/C": { status: 200, body: "<h1>C</h1>" },
    });
    const { pages, sink } = makeSink();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: makeCrawlState(2).state, // resume at index 2 → only C
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 1, skipped: 0 });
    expect(pages.map((p) => p.url)).toEqual(["https://bg3.wiki/C"]);
    // A + B were never fetched (skipped before the resume point).
    expect(calls).toEqual([SITEMAP_URL, "https://bg3.wiki/C"]);
  });

  it("honours the limit and persists the cursor for the next run", async () => {
    const urls = ["https://bg3.wiki/A", "https://bg3.wiki/B", "https://bg3.wiki/C"];
    const { fetcher } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/A": { status: 200, body: "<h1>A</h1>" },
      "https://bg3.wiki/B": { status: 200, body: "<h1>B</h1>" },
      "https://bg3.wiki/C": { status: 200, body: "<h1>C</h1>" },
    });
    const { pages, sink } = makeSink();
    const cs = makeCrawlState();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: cs.state,
      sitemapUrl: SITEMAP_URL,
      limit: 2,
    });

    expect(result).toEqual({ crawled: 2, skipped: 0 });
    expect(pages.map((p) => p.url)).toEqual(["https://bg3.wiki/A", "https://bg3.wiki/B"]);
    expect(cs.cursor).toBe(2); // next run resumes at C
  });

  it("waits on the rate limiter once per fetched page", async () => {
    const urls = ["https://bg3.wiki/A", "https://bg3.wiki/B"];
    const { fetcher } = makeFetcher({
      [SITEMAP_URL]: { status: 200, body: sitemapXml(urls) },
      "https://bg3.wiki/A": { status: 200, body: "<h1>A</h1>" },
      "https://bg3.wiki/B": { status: 200, body: "<h1>B</h1>" },
    });
    let waits = 0;
    await crawlSource({
      source: SOURCE,
      fetcher,
      sink: makeSink().sink,
      robots: ALLOW_ALL,
      rateLimiter: {
        wait: () => {
          waits += 1;
          return Promise.resolve();
        },
      },
      crawlState: makeCrawlState().state,
      sitemapUrl: SITEMAP_URL,
    });
    expect(waits).toBe(2);
  });

  it("returns zero counts when the sitemap fetch is non-2xx", async () => {
    const { fetcher, calls } = makeFetcher({
      [SITEMAP_URL]: { status: 503, body: "" },
    });
    const { pages, sink } = makeSink();

    const result = await crawlSource({
      source: SOURCE,
      fetcher,
      sink,
      robots: ALLOW_ALL,
      rateLimiter: NO_WAIT,
      crawlState: makeCrawlState().state,
      sitemapUrl: SITEMAP_URL,
    });

    expect(result).toEqual({ crawled: 0, skipped: 0 });
    expect(pages).toEqual([]);
    expect(calls).toEqual([SITEMAP_URL]); // no page fetches attempted
  });
});
