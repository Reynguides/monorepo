import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface VerifyBody {
  pages: { total: number; missingR2: string[] };
  images: { total: number; missingR2: string[] };
  chunks: { total: number; missingEmbedding: string[]; missingVector: string[] };
}

beforeEach(() => {
  resetMockVectorIndexClient();
});

async function seed(): Promise<{
  pageId: string;
  imageId: string;
  rawKey: string;
  imgKey: string;
}> {
  const src = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name: "Verify Source", baseUrl: "https://bg3.wiki", tier: 1 },
  });
  const srcJson: { sourceId: string } = await src.json();

  const page = await call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: {
      sourceId: srcJson.sourceId,
      url: "https://bg3.wiki/VerifyPage",
      html: "<p>verify</p>",
    },
  });
  const pageJson: { pageId: string } = await page.json();
  const pageId = pageJson.pageId;

  let binary = "";
  for (const b of new Uint8Array([1, 2, 3])) binary += String.fromCharCode(b);
  const img = await call("/v1/kb/images", {
    method: "POST",
    headers: AUTH,
    jsonBody: {
      pageId,
      url: "https://bg3.wiki/img/v.png",
      contentBase64: btoa(binary),
      contentType: "image/png",
    },
  });
  const imgJson: { imageId: string } = await img.json();
  const imageId = imgJson.imageId;

  return {
    pageId,
    imageId,
    rawKey: `pages/${pageId}/raw.html`,
    imgKey: `images/${imageId}.bin`,
  };
}

/** Seeds + indexes a page with enough body to yield multiple chunks. */
async function seedAndIndex(): Promise<string> {
  const src = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name: "Indexed Source", baseUrl: "https://bg3.wiki", tier: 1 },
  });
  const srcJson: { sourceId: string } = await src.json();
  const html = "<h1>Doc</h1><p>" + "Sentence about a companion. ".repeat(80) + "</p>";
  const page = await call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: { sourceId: srcJson.sourceId, url: "https://bg3.wiki/Indexed", html },
  });
  const pageJson: { pageId: string } = await page.json();
  const idx = await call(`/v1/kb/pages/${pageJson.pageId}/index`, {
    method: "POST",
    headers: AUTH,
  });
  expect(idx.status).toBe(200);
  return pageJson.pageId;
}

describe("GET /v1/kb/verify", () => {
  it("reports zero drift when D1 and R2 agree", async () => {
    const { pageId, imageId } = await seed();
    const res = await call("/v1/kb/verify");
    expect(res.status).toBe(200);
    const body: VerifyBody = await res.json();
    expect(body.pages.missingR2).not.toContain(pageId);
    expect(body.images.missingR2).not.toContain(imageId);
    expect(body.pages.total).toBeGreaterThanOrEqual(1);
    expect(body.images.total).toBeGreaterThanOrEqual(1);
  });

  it("reports drift when a page's raw R2 object is deleted out-of-band", async () => {
    const { pageId, rawKey } = await seed();
    await env.KB_BUCKET.delete(rawKey);

    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.pages.missingR2).toContain(pageId);
  });

  it("reports drift when an image's R2 object is deleted out-of-band", async () => {
    const { imageId, imgKey } = await seed();
    await env.KB_BUCKET.delete(imgKey);

    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.images.missingR2).toContain(imageId);
  });

  it("treats a page with a NULL r2_raw_key as missing R2", async () => {
    // A page row whose raw key was never set (defensive: no API path produces
    // this, so insert directly) must be reported as drift.
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-null", "Null Source", "https://null.test", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("page-null-raw", "src-null", "https://null.test/p", "h", now, now)
      .run();

    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.pages.missingR2).toContain("page-null-raw");
  });

  it("reports zero chunk/vector drift right after indexing a page", async () => {
    const pageId = await seedAndIndex();
    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.chunks.total).toBeGreaterThan(1);
    expect(body.chunks.missingEmbedding).toEqual([]);
    expect(body.chunks.missingVector).toEqual([]);
    // Sanity: the indexed page's chunks contribute to the total.
    const count = await env.KB_DB.prepare("SELECT COUNT(*) AS n FROM chunks WHERE page_id = ?")
      .bind(pageId)
      .first<{ n: number }>();
    expect(count!.n).toBeGreaterThan(1);
  });

  it("reports missingEmbedding when an embedding_state row is deleted out-of-band", async () => {
    const pageId = await seedAndIndex();
    // Delete one ledger row, leaving its chunk row → that chunk lacks an embedding.
    const chunk = await env.KB_DB.prepare(
      "SELECT id FROM chunks WHERE page_id = ? ORDER BY ord LIMIT 1",
    )
      .bind(pageId)
      .first<{ id: string }>();
    await env.KB_DB.prepare("DELETE FROM embedding_state WHERE chunk_id = ?").bind(chunk!.id).run();

    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.chunks.missingEmbedding).toContain(chunk!.id);
  });

  it("reports missingVector when a recorded vector vanishes from the index", async () => {
    const pageId = await seedAndIndex();
    // Reset the singleton mock vector index AFTER indexing → the ledger still
    // references vector ids that no longer resolve in the (now empty) index.
    resetMockVectorIndexClient();

    const res = await call("/v1/kb/verify");
    const body: VerifyBody = await res.json();
    expect(body.chunks.missingVector.length).toBeGreaterThan(0);
    expect(body.chunks.missingVector).toContain(`${pageId}:0`);
  });
});
