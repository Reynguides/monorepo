import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import type { VerifyResponse } from "../../schemas/kb.ts";
import { listAllPages } from "../../repo/pages.ts";
import { listAllImages } from "../../repo/images.ts";
import { listAllChunks } from "../../repo/chunks.ts";
import { getByChunkIds, listChunkIdsLackingEmbedding } from "../../repo/embedding-state.ts";
import { createObjectStore } from "../../store/factory.ts";
import { createVectorIndexClient } from "../../vector/factory.ts";
import type { IObjectStore } from "../../store/types.ts";
import { BGE_BASE_MODEL } from "../../embedding/WorkersAiEmbeddingProvider.ts";

async function r2Exists(store: IObjectStore, key: string | null): Promise<boolean> {
  if (key === null) {
    return false;
  }
  return (await store.getBytes(key)) !== null;
}

/**
 * GET /v1/kb/verify (open) → reconciles D1 ↔ R2 ↔ Vectorize.
 *
 * For each page checks its `r2_raw_key` object exists in R2; for each image
 * checks `r2_key` exists; reports ids whose backing R2 object is missing.
 *
 * For chunks (ADR-0016): reports `missingEmbedding` (chunks with no
 * embedding_state ledger row for the active model) and `missingVector`
 * (recorded `vector_id`s that don't resolve in the index). The vector check
 * uses `getByIds` — a targeted lookup of the ids the ledger claims exist, NOT
 * a full index scan (Vectorize has no list/enumerate API).
 */
export const verifyHandler: Handler<{ Bindings: Env }> = async (c) => {
  const store = createObjectStore(c.env);

  const pages = await listAllPages(c.env.KB_DB);
  const pagesMissing: string[] = [];
  for (const p of pages) {
    if (!(await r2Exists(store, p.r2_raw_key))) {
      pagesMissing.push(p.id);
    }
  }

  const images = await listAllImages(c.env.KB_DB);
  const imagesMissing: string[] = [];
  for (const img of images) {
    if (!(await r2Exists(store, img.r2_key))) {
      imagesMissing.push(img.id);
    }
  }

  // chunks ↔ embedding_state ↔ Vectorize reconciliation.
  const chunks = await listAllChunks(c.env.KB_DB);
  const missingEmbedding = await listChunkIdsLackingEmbedding(c.env.KB_DB, BGE_BASE_MODEL);

  // Spot-check the recorded vector ids resolve in the index (getByIds, not scan).
  const ledger = await getByChunkIds(
    c.env.KB_DB,
    chunks.map((ch) => ch.id),
  );
  const recordedVectorIds = ledger.map((l) => l.vector_id);
  const missingVector: string[] = [];
  if (recordedVectorIds.length > 0) {
    const vector = createVectorIndexClient(c.env);
    const found = new Set((await vector.getByIds(recordedVectorIds)).map((r) => r.id));
    for (const vid of recordedVectorIds) {
      if (!found.has(vid)) {
        missingVector.push(vid);
      }
    }
  }

  const body: VerifyResponse = {
    pages: { total: pages.length, missingR2: pagesMissing },
    images: { total: images.length, missingR2: imagesMissing },
    chunks: { total: chunks.length, missingEmbedding, missingVector },
  };
  return c.json(body, 200);
};
