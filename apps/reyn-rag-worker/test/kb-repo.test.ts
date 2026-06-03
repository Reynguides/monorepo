import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { insertSource, upsertSource, getSourceById, listSources } from "../src/repo/sources.ts";
import { upsertImageByPageUrl, listImagesByPage, getImageById } from "../src/repo/images.ts";
import { newId } from "../src/lib/id.ts";
import { sha256Hex } from "../src/lib/content-hash.ts";
import { base64ToArrayBuffer } from "../src/lib/base64.ts";

describe("sources repo", () => {
  it("inserts, fetches by id, and lists", async () => {
    const id = newId();
    await insertSource(
      env.KB_DB,
      { id, name: "Repo Src", base_url: "https://x.test", tier: 3 },
      Date.now(),
    );

    const byId = await getSourceById(env.KB_DB, id);
    expect(byId!.name).toBe("Repo Src");
    expect(byId!.tier).toBe(3);

    const all = await listSources(env.KB_DB);
    expect(all.some((s) => s.id === id)).toBe(true);
  });

  it("returns null for a missing source", async () => {
    expect(await getSourceById(env.KB_DB, "nope")).toBeNull();
  });

  it("upsertSource is idempotent on id and preserves the original row", async () => {
    const id = "catalog-id";
    const created = await upsertSource(
      env.KB_DB,
      { id, name: "First", base_url: "https://first.test", tier: 1 },
      1000,
    );
    expect(created).toBe(id);

    // Re-upsert with different fields + a later timestamp → IGNORE keeps the
    // original row (name, base_url, tier, created_at all unchanged).
    const again = await upsertSource(
      env.KB_DB,
      { id, name: "Second", base_url: "https://second.test", tier: 9 },
      2000,
    );
    expect(again).toBe(id);

    const row = await getSourceById(env.KB_DB, id);
    expect(row!.name).toBe("First");
    expect(row!.tier).toBe(1);
    expect(row!.created_at).toBe(1000);

    const all = await listSources(env.KB_DB);
    expect(all.filter((s) => s.id === id)).toHaveLength(1);
  });
});

describe("images repo", () => {
  it("upserts in place by (page,url) and lists by page", async () => {
    const pageId = newId();
    const imageId = newId();
    const first = await upsertImageByPageUrl(env.KB_DB, {
      id: imageId,
      pageId,
      url: "https://x.test/a.png",
      contentHash: "h1",
      r2Key: `images/${imageId}.bin`,
      altText: "alt1",
    });
    expect(first.id).toBe(imageId);

    // Second upsert for the same (page,url) keeps id + r2_key, updates hash/alt.
    const second = await upsertImageByPageUrl(env.KB_DB, {
      id: newId(),
      pageId,
      url: "https://x.test/a.png",
      contentHash: "h2",
      r2Key: "images/SHOULD-NOT-BE-USED.bin",
      altText: "alt2",
    });
    expect(second.id).toBe(imageId);
    expect(second.r2Key).toBe(`images/${imageId}.bin`);

    const row = await getImageById(env.KB_DB, imageId);
    expect(row!.content_hash).toBe("h2");
    expect(row!.alt_text).toBe("alt2");

    const list = await listImagesByPage(env.KB_DB, pageId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(imageId);
  });

  it("returns null for a missing image", async () => {
    expect(await getImageById(env.KB_DB, "nope")).toBeNull();
  });
});

describe("lib helpers", () => {
  it("sha256Hex is stable + 64 hex chars", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("world")).not.toBe(a);
  });

  it("newId returns distinct UUIDs", () => {
    expect(newId()).not.toBe(newId());
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("base64ToArrayBuffer round-trips and rejects garbage", () => {
    expect(Array.from(new Uint8Array(base64ToArrayBuffer(btoa("hi"))))).toEqual([104, 105]);
    expect(() => base64ToArrayBuffer("!!!")).toThrow();
  });
});
