import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface VerifyBody {
  pages: { total: number; missingR2: string[] };
  images: { total: number; missingR2: string[] };
}

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
});
