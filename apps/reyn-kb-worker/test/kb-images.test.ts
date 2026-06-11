import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface ImageResp {
  imageId: string;
  changed: boolean;
}

function postImage(jsonBody: unknown): Promise<Response> {
  return call("/v1/kb/images", { method: "POST", headers: AUTH, jsonBody });
}

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
  await upsertPageByUrl(env.KB_DB, {
    id: "p1",
    sourceId: "s1",
    url: "https://bg3.wiki/Fireball",
    contentHash: "h",
    crawledAt: Date.now(),
    updatedAt: Date.now(),
  });
});

describe("KB images API", () => {
  const img = {
    pageId: "p1",
    url: "https://bg3.wiki/img.png",
    contentType: "image/png",
    dataBase64: "aGVsbG8=", // "hello"
    altText: "a fireball",
  };

  it("stores an image and streams it back with hardened headers", async () => {
    const res = await postImage(img);
    expect(res.status).toBe(200);
    const { imageId } = await readJson<ImageResp>(res);

    const get = await call(`/v1/kb/images/${imageId}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("image/png");
    expect(get.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(get.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(await get.text()).toBe("hello");
  });

  it("is idempotent on unchanged bytes", async () => {
    const first = await readJson<ImageResp>(await postImage(img));
    const second = await readJson<ImageResp>(await postImage(img));
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.imageId).toBe(first.imageId);
  });

  it("404s for an unknown page and 400s on invalid base64", async () => {
    expect((await postImage({ ...img, pageId: "ghost" })).status).toBe(404);
    expect((await postImage({ ...img, dataBase64: "@@@not-base64@@@" })).status).toBe(400);
  });

  it("rejects a disallowed content-type (no SVG — stored-XSS guard)", async () => {
    const res = await postImage({ ...img, contentType: "image/svg+xml" });
    expect(res.status).toBe(400);
  });

  it("404s GET for an unknown image id", async () => {
    expect((await call("/v1/kb/images/ghost")).status).toBe(404);
  });
});
