import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import type { VerifyResponse } from "../../schemas/kb.ts";
import { listAllPages } from "../../repo/pages.ts";
import { listAllImages } from "../../repo/images.ts";
import { createObjectStore } from "../../store/factory.ts";
import type { IObjectStore } from "../../store/types.ts";

async function r2Exists(store: IObjectStore, key: string | null): Promise<boolean> {
  if (key === null) {
    return false;
  }
  return (await store.getBytes(key)) !== null;
}

/**
 * GET /v1/kb/verify (open) → reconciles D1 ↔ R2. For each page checks its
 * `r2_raw_key` object exists in R2; for each image checks `r2_key` exists.
 * Reports ids whose backing R2 object is missing (drift).
 *
 * TODO(Phase 4): also reconcile embedding_state ↔ Vectorize by resolving each
 * `embedding_state.vector_id` via the index client's `getByIds` (NOT a full
 * index scan — Vectorize has no list/scan API; see ADR-0016).
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

  const body: VerifyResponse = {
    pages: { total: pages.length, missingR2: pagesMissing },
    images: { total: images.length, missingR2: imagesMissing },
  };
  return c.json(body, 200);
};
