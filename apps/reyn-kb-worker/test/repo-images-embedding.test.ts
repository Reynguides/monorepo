import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";
import { insertChunks } from "../src/repo/chunks.ts";
import {
  upsertImageByPageUrl,
  getImageById,
  listImagesByPage,
  linkChunkImage,
  listImagesByChunk,
} from "../src/repo/images.ts";
import {
  insertEmbeddingState,
  listVectorIdsByPageId,
  deleteEmbeddingStateByChunkIds,
  getEmbeddingStateByChunkIds,
  listChunkIdsLackingEmbedding,
} from "../src/repo/embedding-state.ts";

const now = 1_700_000_000_000;
const MODEL = "@cf/baai/bge-base-en-v1.5";

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://x",
    tier: 1,
    createdAt: now,
  });
  await upsertPageByUrl(env.KB_DB, {
    id: "p1",
    sourceId: "s1",
    url: "https://x/p1",
    contentHash: "h",
    crawledAt: now,
    updatedAt: now,
  });
});

describe("repo/images", () => {
  it("upserts by (page_id,url), preserves id on conflict, links + lists by chunk", async () => {
    const first = await upsertImageByPageUrl(env.KB_DB, {
      id: "img0",
      pageId: "p1",
      url: "https://x/a.png",
      contentHash: "ih0",
      r2Key: "images/img0",
      contentType: "image/png",
      altText: "A",
      width: 10,
      height: 20,
    });
    expect(first).toEqual({ id: "img0", isNew: true });

    const again = await upsertImageByPageUrl(env.KB_DB, {
      id: "img0-ignored",
      pageId: "p1",
      url: "https://x/a.png",
      contentHash: "ih1",
      r2Key: "images/whatever",
      contentType: "image/webp",
    });
    expect(again).toEqual({ id: "img0", isNew: false });
    const row = await getImageById(env.KB_DB, "img0");
    expect(row!.content_hash).toBe("ih1");
    expect(row!.content_type).toBe("image/webp");
    expect(row!.r2_key).toBe("images/img0"); // r2_key preserved
    expect(row!.width).toBe(10);

    expect(await getImageById(env.KB_DB, "nope")).toBeNull();
    expect((await listImagesByPage(env.KB_DB, "p1")).length).toBe(1);

    await insertChunks(env.KB_DB, [
      { id: "p1:0", pageId: "p1", ord: 0, text: "see image", contentHash: "c0", tokenCount: 2 },
    ]);
    await linkChunkImage(env.KB_DB, "p1:0", "img0");
    await linkChunkImage(env.KB_DB, "p1:0", "img0"); // idempotent
    const linked = await listImagesByChunk(env.KB_DB, "p1:0");
    expect(linked.map((i) => i.id)).toEqual(["img0"]);
  });
});

describe("repo/embedding-state", () => {
  beforeEach(async () => {
    await insertChunks(env.KB_DB, [
      { id: "p1:0", pageId: "p1", ord: 0, text: "a", contentHash: "c0", tokenCount: 1 },
      { id: "p1:1", pageId: "p1", ord: 1, text: "b", contentHash: "c1", tokenCount: 1 },
    ]);
  });

  it("is a no-op on empty inputs", async () => {
    await insertEmbeddingState(env.KB_DB, []);
    await deleteEmbeddingStateByChunkIds(env.KB_DB, []);
    expect(await getEmbeddingStateByChunkIds(env.KB_DB, [])).toEqual([]);
    expect(await listVectorIdsByPageId(env.KB_DB, "p1")).toEqual([]);
  });

  it("records ledger rows, lists vector ids by page, and upserts on conflict", async () => {
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: "p1:0", model: MODEL, vectorId: "p1:0", namespace: "spell", indexedAt: now },
      { chunkId: "p1:1", model: MODEL, vectorId: "p1:1", indexedAt: now },
    ]);
    expect((await listVectorIdsByPageId(env.KB_DB, "p1")).sort()).toEqual(["p1:0", "p1:1"]);

    // Re-index same chunk → conflict update keeps one row, new vector id.
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: "p1:0", model: MODEL, vectorId: "p1:0-v2", indexedAt: now + 1 },
    ]);
    const rows = await getEmbeddingStateByChunkIds(env.KB_DB, ["p1:0"]);
    expect(rows.length).toBe(1);
    expect(rows[0]!.vector_id).toBe("p1:0-v2");
  });

  it("detects missing-embedding drift and deletes ledger rows", async () => {
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: "p1:0", model: MODEL, vectorId: "p1:0", indexedAt: now },
    ]);
    // p1:1 has no embedding row for MODEL → drift.
    expect(await listChunkIdsLackingEmbedding(env.KB_DB, MODEL)).toEqual(["p1:1"]);

    await deleteEmbeddingStateByChunkIds(env.KB_DB, ["p1:0"]);
    expect(await getEmbeddingStateByChunkIds(env.KB_DB, ["p1:0", "p1:1"])).toEqual([]);
  });
});
