import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";
import { createVectorIndexClient, resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface PageResult {
  pageId: string;
  changed: boolean;
}
interface IndexResult {
  pageId: string;
  chunks: number;
  reindexed: boolean;
}
interface ErrorBody {
  error: string;
}

beforeEach(() => {
  // Vectorize has no emulator; the index/verify flows use the singleton mock
  // vector client which persists across requests. Clear it per test for isolation.
  resetMockVectorIndexClient();
});

async function createSource(): Promise<string> {
  const res = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name: "Index Source", baseUrl: "https://bg3.wiki", tier: 1 },
  });
  const json: { sourceId: string } = await res.json();
  return json.sourceId;
}

async function storePage(sourceId: string, url: string, html: string): Promise<string> {
  const res = await call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: { sourceId, url, html },
  });
  const json: PageResult = await res.json();
  return json.pageId;
}

async function indexPage(pageId: string): Promise<Response> {
  return call(`/v1/kb/pages/${pageId}/index`, { method: "POST", headers: AUTH });
}

async function chunkRows(pageId: string): Promise<{ id: string; ord: number }[]> {
  const rows = await env.KB_DB.prepare("SELECT id, ord FROM chunks WHERE page_id = ? ORDER BY ord")
    .bind(pageId)
    .all<{ id: string; ord: number }>();
  return rows.results;
}

async function ledgerVectorIds(pageId: string): Promise<string[]> {
  const rows = await env.KB_DB.prepare(
    `SELECT es.vector_id AS vector_id FROM embedding_state es
     JOIN chunks c ON c.id = es.chunk_id WHERE c.page_id = ? ORDER BY c.ord`,
  )
    .bind(pageId)
    .all<{ vector_id: string }>();
  return rows.results.map((r) => r.vector_id);
}

const RICH_HTML =
  "<h1>Astarion</h1><p>" +
  "Astarion is a high elf vampire spawn companion. ".repeat(60) +
  "</p><h2>Origins</h2><p>" +
  "He was a magistrate turned spawn by Cazador. ".repeat(60) +
  "</p>";

describe("POST /v1/kb/pages/:id/index", () => {
  it("extracts, chunks, embeds and upserts vectors; sets r2_md_key", async () => {
    const sourceId = await createSource();
    const pageId = await storePage(sourceId, "https://bg3.wiki/Astarion", RICH_HTML);

    const res = await indexPage(pageId);
    expect(res.status).toBe(200);
    const json: IndexResult = await res.json();
    expect(json.pageId).toBe(pageId);
    expect(json.chunks).toBeGreaterThan(1);
    expect(json.reindexed).toBe(false);

    // chunks + embedding_state rows created.
    const chunks = await chunkRows(pageId);
    expect(chunks).toHaveLength(json.chunks);
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_c, i) => i));

    const vectorIds = await ledgerVectorIds(pageId);
    expect(vectorIds).toEqual(chunks.map((c) => `${pageId}:${c.ord}`));

    // vectors upserted into the singleton mock index.
    const vector = createVectorIndexClient(env);
    const found = await vector.getByIds(vectorIds);
    expect(found.map((f) => f.id).sort()).toEqual([...vectorIds].sort());
    // metadata carries source tier + url.
    expect(found[0]!.metadata).toMatchObject({ page_id: pageId, source_tier: 1 });

    // markdown blob written + r2_md_key set.
    const row = await env.KB_DB.prepare("SELECT r2_md_key FROM pages WHERE id = ?")
      .bind(pageId)
      .first<{ r2_md_key: string | null }>();
    expect(row!.r2_md_key).toBe(`pages/${pageId}/clean.md`);
    const md = await env.KB_BUCKET.get(`pages/${pageId}/clean.md`);
    expect(await md!.text()).toContain("# Astarion");
  });

  it("supersedes prior chunks + vectors on re-index after html changes (no orphans)", async () => {
    const sourceId = await createSource();
    const url = "https://bg3.wiki/Karlach";
    const pageId = await storePage(sourceId, url, RICH_HTML);

    await indexPage(pageId);
    const oldVectorIds = await ledgerVectorIds(pageId);
    expect(oldVectorIds.length).toBeGreaterThan(1);

    // Change the page content (re-store), then re-index.
    const shortHtml = "<h1>Karlach</h1><p>A short tiefling barbarian bio.</p>";
    await storePage(sourceId, url, shortHtml);
    const res = await indexPage(pageId);
    const json: IndexResult = await res.json();
    expect(json.reindexed).toBe(true);
    expect(json.chunks).toBe(1);

    const newVectorIds = await ledgerVectorIds(pageId);
    expect(newVectorIds).toEqual([`${pageId}:0`]);

    // Old vectors that no longer correspond to a chunk are gone from the index.
    const vector = createVectorIndexClient(env);
    const orphanCandidates = oldVectorIds.filter((id) => !newVectorIds.includes(id));
    expect(orphanCandidates.length).toBeGreaterThan(0);
    const stillThere = await vector.getByIds(orphanCandidates);
    expect(stillThere).toHaveLength(0);

    // chunk count in D1 matches the new set (no stale rows).
    const chunks = await chunkRows(pageId);
    expect(chunks).toHaveLength(1);
  });

  it("stores nothing and returns chunks:0 for an empty page body", async () => {
    const sourceId = await createSource();
    const pageId = await storePage(sourceId, "https://bg3.wiki/Empty", "<div></div>");
    const res = await indexPage(pageId);
    expect(res.status).toBe(200);
    const json: IndexResult = await res.json();
    expect(json.chunks).toBe(0);
    expect(await chunkRows(pageId)).toHaveLength(0);
  });

  it("returns 409 when the page's raw HTML object is missing from R2", async () => {
    const sourceId = await createSource();
    const pageId = await storePage(sourceId, "https://bg3.wiki/Gone", "<p>x</p>");
    await env.KB_BUCKET.delete(`pages/${pageId}/raw.html`);
    const res = await indexPage(pageId);
    expect(res.status).toBe(409);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("raw_html_missing");
  });

  it("returns 409 when the page row has a NULL r2_raw_key", async () => {
    // Defensive: no API path produces a NULL raw key, so insert one directly.
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-idx-null", "Null", "https://null.test", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("page-idx-null", "src-idx-null", "https://null.test/p", "h", now, now)
      .run();
    const res = await indexPage("page-idx-null");
    expect(res.status).toBe(409);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("raw_html_missing");
  });

  it("indexes with source_tier=null when the page's source row is absent", async () => {
    // Insert a page that references a non-existent source (defensive integrity
    // boundary; FKs are not DB-enforced). The index still succeeds; tier is null.
    const now = Date.now();
    const html = "<h1>Orphan</h1><p>" + "Body text for an orphan page. ".repeat(60) + "</p>";
    await env.KB_BUCKET.put("pages/page-orphan/raw.html", html, {
      httpMetadata: { contentType: "text/html" },
    });
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, content_hash, r2_raw_key, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "page-orphan",
        "missing-source",
        "https://orphan.test/p",
        "h",
        "pages/page-orphan/raw.html",
        now,
        now,
      )
      .run();

    const res = await indexPage("page-orphan");
    expect(res.status).toBe(200);
    const json: IndexResult = await res.json();
    expect(json.chunks).toBeGreaterThan(1);

    const vector = createVectorIndexClient(env);
    const found = await vector.getByIds(["page-orphan:0"]);
    expect(found[0]!.metadata).toMatchObject({ source_tier: null });
  });

  it("returns 404 for a missing page", async () => {
    const res = await indexPage("does-not-exist");
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("page_not_found");
  });

  it("returns 401 without the ingest key", async () => {
    const sourceId = await createSource();
    const pageId = await storePage(sourceId, "https://bg3.wiki/NoAuth", "<p>x</p>");
    const res = await call(`/v1/kb/pages/${pageId}/index`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
