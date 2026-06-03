import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";
import { getCrawlState, upsertCrawlState } from "../src/repo/crawl-state.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface CrawlStateBody {
  cursor: number;
  status: string;
  lastSitemapAt: number | null;
}
interface ErrorBody {
  error: string;
}

describe("crawl_state repo", () => {
  it("inserts then updates in place (cursor/status), preserving last_sitemap_at when omitted", async () => {
    const sourceId = `repo-${crypto.randomUUID()}`;
    await upsertCrawlState(env.KB_DB, {
      sourceId,
      cursor: "0",
      status: "crawling",
      lastSitemapAt: 111,
    });
    let row = await getCrawlState(env.KB_DB, sourceId);
    expect(row).toMatchObject({ cursor: "0", status: "crawling", last_sitemap_at: 111 });

    // Update without lastSitemapAt → COALESCE keeps 111.
    await upsertCrawlState(env.KB_DB, { sourceId, cursor: "5", status: "idle" });
    row = await getCrawlState(env.KB_DB, sourceId);
    expect(row).toMatchObject({ cursor: "5", status: "idle", last_sitemap_at: 111 });
  });

  it("returns null for an unknown source", async () => {
    expect(await getCrawlState(env.KB_DB, "missing")).toBeNull();
  });
});

describe("GET /v1/kb/crawl-state/:sourceId", () => {
  it("returns 404 when no crawl state exists", async () => {
    const res = await call("/v1/kb/crawl-state/never-crawled");
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("crawl_state_not_found");
  });

  it("returns the cursor/status/lastSitemapAt after an upsert", async () => {
    const sourceId = `ep-${crypto.randomUUID()}`;
    await upsertCrawlState(env.KB_DB, {
      sourceId,
      cursor: "7",
      status: "crawling",
      lastSitemapAt: 999,
    });
    const res = await call(`/v1/kb/crawl-state/${sourceId}`);
    expect(res.status).toBe(200);
    const body: CrawlStateBody = await res.json();
    expect(body).toEqual({ cursor: 7, status: "crawling", lastSitemapAt: 999 });
  });

  it("defaults a null/garbage stored cursor to 0", async () => {
    const sourceId = `nullcur-${crypto.randomUUID()}`;
    // Seed a row with a NULL cursor directly (the pipeline always writes a
    // numeric string, but a fresh provisioning row may have NULL).
    await env.KB_DB.prepare(
      "INSERT INTO crawl_state (source_id, last_sitemap_at, cursor, status) VALUES (?, ?, ?, ?)",
    )
      .bind(sourceId, null, null, "idle")
      .run();
    const res = await call(`/v1/kb/crawl-state/${sourceId}`);
    const body: CrawlStateBody = await res.json();
    expect(body).toEqual({ cursor: 0, status: "idle", lastSitemapAt: null });
  });
});

describe("POST /v1/kb/crawl-state", () => {
  it("upserts and returns 200 (then readable via GET)", async () => {
    const sourceId = `post-${crypto.randomUUID()}`;
    const res = await call("/v1/kb/crawl-state", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId, cursor: 12, status: "crawling", lastSitemapAt: 42 },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const get = await call(`/v1/kb/crawl-state/${sourceId}`);
    const body: CrawlStateBody = await get.json();
    expect(body).toEqual({ cursor: 12, status: "crawling", lastSitemapAt: 42 });
  });

  it("accepts an upsert with lastSitemapAt omitted", async () => {
    const sourceId = `post2-${crypto.randomUUID()}`;
    const res = await call("/v1/kb/crawl-state", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId, cursor: 3, status: "idle" },
    });
    expect(res.status).toBe(200);
    const get = await call(`/v1/kb/crawl-state/${sourceId}`);
    const body: CrawlStateBody = await get.json();
    expect(body).toEqual({ cursor: 3, status: "idle", lastSitemapAt: null });
  });

  it("rejects an invalid body with 400 validation_failed", async () => {
    const res = await call("/v1/kb/crawl-state", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId: "", cursor: -1, status: "" },
    });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await call("/v1/kb/crawl-state", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
