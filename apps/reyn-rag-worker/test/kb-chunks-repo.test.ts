import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { newId } from "../src/lib/id.ts";
import {
  deleteChunksByPageId,
  insertChunks,
  listAllChunks,
  listChunksByPageId,
  type NewChunk,
} from "../src/repo/chunks.ts";
import {
  deleteEmbeddingStateByChunkIds,
  getByChunkIds,
  getEmbeddingStateByPageId,
  insertEmbeddingState,
  listChunkIdsLackingEmbedding,
  listVectorIdsByPageId,
} from "../src/repo/embedding-state.ts";

const MODEL = "@cf/baai/bge-base-en-v1.5";

function chunk(pageId: string, ord: number): NewChunk {
  return {
    id: `${pageId}:${ord}`,
    pageId,
    ord,
    text: `chunk ${ord}`,
    contentHash: `h${ord}`,
    tokenCount: 3,
  };
}

describe("chunks repo", () => {
  it("inserts, lists in ord order, lists all, and deletes by page", async () => {
    const pageId = newId();
    await insertChunks(env.KB_DB, [chunk(pageId, 0), chunk(pageId, 1), chunk(pageId, 2)]);

    const list = await listChunksByPageId(env.KB_DB, pageId);
    expect(list.map((c) => c.ord)).toEqual([0, 1, 2]);
    expect(list[0]!.token_count).toBe(3);

    const all = await listAllChunks(env.KB_DB);
    expect(all.some((c) => c.page_id === pageId)).toBe(true);

    await deleteChunksByPageId(env.KB_DB, pageId);
    expect(await listChunksByPageId(env.KB_DB, pageId)).toHaveLength(0);
  });

  it("insertChunks is a no-op for an empty batch", async () => {
    await expect(insertChunks(env.KB_DB, [])).resolves.toBeUndefined();
  });
});

describe("embedding-state repo", () => {
  it("inserts, joins by page, lists vector ids, and fetches by chunk ids", async () => {
    const pageId = newId();
    await insertChunks(env.KB_DB, [chunk(pageId, 0), chunk(pageId, 1)]);
    const now = Date.now();
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: `${pageId}:0`, model: MODEL, vectorId: `${pageId}:0`, indexedAt: now },
      { chunkId: `${pageId}:1`, model: MODEL, vectorId: `${pageId}:1`, indexedAt: now },
    ]);

    const byPage = await getEmbeddingStateByPageId(env.KB_DB, pageId);
    expect(byPage.map((r) => r.vector_id)).toEqual([`${pageId}:0`, `${pageId}:1`]);

    const vids = await listVectorIdsByPageId(env.KB_DB, pageId);
    expect(vids).toEqual([`${pageId}:0`, `${pageId}:1`]);

    const fetched = await getByChunkIds(env.KB_DB, [`${pageId}:0`, `${pageId}:1`]);
    expect(fetched).toHaveLength(2);
  });

  it("listChunkIdsLackingEmbedding finds chunks with no ledger row", async () => {
    const pageId = newId();
    await insertChunks(env.KB_DB, [chunk(pageId, 0), chunk(pageId, 1)]);
    // Only embed ord 0.
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: `${pageId}:0`, model: MODEL, vectorId: `${pageId}:0`, indexedAt: Date.now() },
    ]);
    const lacking = await listChunkIdsLackingEmbedding(env.KB_DB, MODEL);
    expect(lacking).toContain(`${pageId}:1`);
    expect(lacking).not.toContain(`${pageId}:0`);
  });

  it("deleteEmbeddingStateByChunkIds removes the ledger rows", async () => {
    const pageId = newId();
    await insertChunks(env.KB_DB, [chunk(pageId, 0)]);
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: `${pageId}:0`, model: MODEL, vectorId: `${pageId}:0`, indexedAt: Date.now() },
    ]);
    await deleteEmbeddingStateByChunkIds(env.KB_DB, [`${pageId}:0`]);
    expect(await listVectorIdsByPageId(env.KB_DB, pageId)).toHaveLength(0);
  });

  it("empty-input helpers are no-ops / return empty", async () => {
    await expect(insertEmbeddingState(env.KB_DB, [])).resolves.toBeUndefined();
    await expect(deleteEmbeddingStateByChunkIds(env.KB_DB, [])).resolves.toBeUndefined();
    expect(await getByChunkIds(env.KB_DB, [])).toEqual([]);
  });
});
