import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface ErrorBody {
  error: string;
}

async function seedPage(): Promise<string> {
  const src = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name: "Img Source", baseUrl: "https://bg3.wiki", tier: 1 },
  });
  const srcJson: { sourceId: string } = await src.json();
  const page = await call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: {
      sourceId: srcJson.sourceId,
      url: "https://bg3.wiki/ImgPage",
      html: "<p>img page</p>",
    },
  });
  const pageJson: { pageId: string } = await page.json();
  return pageJson.pageId;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe("POST /v1/kb/images + GET /v1/kb/images/:id", () => {
  it("round-trips image bytes and content-type", async () => {
    const pageId = await seedPage();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: AUTH,
      jsonBody: {
        pageId,
        url: "https://bg3.wiki/img/astarion.png",
        altText: "Astarion portrait",
        contentBase64: bytesToBase64(bytes),
        contentType: "image/png",
      },
    });
    expect(res.status).toBe(201);
    const json: { imageId: string } = await res.json();

    const row = await env.KB_DB.prepare("SELECT r2_key, alt_text FROM images WHERE id = ?")
      .bind(json.imageId)
      .first<{ r2_key: string; alt_text: string }>();
    expect(row!.r2_key).toBe(`images/${json.imageId}.bin`);
    expect(row!.alt_text).toBe("Astarion portrait");

    const get = await call(`/v1/kb/images/${json.imageId}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("image/png");
    const got = new Uint8Array(await get.arrayBuffer());
    expect(got).toEqual(bytes);
  });

  it("returns 404 when the page is unknown", async () => {
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: AUTH,
      jsonBody: {
        pageId: "00000000-0000-0000-0000-000000000000",
        url: "https://bg3.wiki/img/x.png",
        contentBase64: bytesToBase64(new Uint8Array([1, 2])),
        contentType: "image/png",
      },
    });
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("page_not_found");
  });

  it("returns 400 on invalid base64", async () => {
    const pageId = await seedPage();
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: AUTH,
      jsonBody: {
        pageId,
        url: "https://bg3.wiki/img/bad.png",
        contentBase64: "!!!not base64!!!",
        contentType: "image/png",
      },
    });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("invalid_base64");
  });

  it("returns 400 on a structurally invalid body", async () => {
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: AUTH,
      jsonBody: { pageId: "", url: "nope", contentBase64: "", contentType: "" },
    });
    expect(res.status).toBe(400);
  });

  it("GET returns 404 for a missing image row", async () => {
    const res = await call("/v1/kb/images/missing");
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("image_not_found");
  });

  it("GET returns 404 image_bytes_missing when the R2 object is gone (drift)", async () => {
    const pageId = await seedPage();
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: AUTH,
      jsonBody: {
        pageId,
        url: "https://bg3.wiki/img/drift.png",
        contentBase64: bytesToBase64(new Uint8Array([1, 2, 3])),
        contentType: "image/png",
      },
    });
    const json: { imageId: string } = await res.json();
    await env.KB_BUCKET.delete(`images/${json.imageId}.bin`);

    const get = await call(`/v1/kb/images/${json.imageId}`);
    expect(get.status).toBe(404);
    const body: ErrorBody = await get.json();
    expect(body.error).toBe("image_bytes_missing");
  });

  it("returns 400 on a malformed JSON body", async () => {
    const res = await call("/v1/kb/images", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("falls back to application/octet-stream when R2 has no stored content-type", async () => {
    // Seed an image row + an R2 object with NO httpMetadata content-type to
    // exercise the octet-stream fallback in the read handler.
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-oct", "Oct Source", "https://oct.test", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("page-oct", "src-oct", "https://oct.test/p", "h", now, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO images (id, page_id, url, content_hash, r2_key, alt_text) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("img-oct", "page-oct", "https://oct.test/i.bin", "h", "images/img-oct.bin", null)
      .run();
    await env.KB_BUCKET.put("images/img-oct.bin", new Uint8Array([7, 7, 7]).buffer);

    const get = await call("/v1/kb/images/img-oct");
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
