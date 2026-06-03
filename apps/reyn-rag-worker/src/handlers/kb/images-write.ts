import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { sha256HexBytes } from "../../lib/content-hash.ts";
import { newId } from "../../lib/id.ts";
import { base64ToArrayBuffer } from "../../lib/base64.ts";
import { StoreImageRequest, type StoreImageResponse } from "../../schemas/kb.ts";
import { getPageById } from "../../repo/pages.ts";
import { getImageByPageUrl, upsertImageByPageUrl } from "../../repo/images.ts";
import { createObjectStore } from "../../store/factory.ts";

/** R2 key for an image blob. */
export function imageKey(imageId: string): string {
  return `images/${imageId}.bin`;
}

/**
 * POST /v1/kb/images (ingest-key gated). Decodes base64 → bytes and hashes those
 * DECODED bytes. Image identity is (page_id, url) per ADR-0016; content_hash is a
 * byte-level change-detector. If the image exists and the hash matches, returns
 * {imageId} with NO R2 write (idempotent no-op, mirroring the page handler). Else
 * it stores bytes in R2 under the row's deterministic key and upserts the row
 * (supersede-in-place — reuses the existing r2_key so blobs aren't orphaned).
 */
export const storeImageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StoreImageRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { pageId, url, altText, contentBase64, contentType } = parsed.data;

  const page = await getPageById(c.env.KB_DB, pageId);
  if (page === null) {
    return fail(c, 404, "page_not_found");
  }

  let buffer: ArrayBuffer;
  try {
    buffer = base64ToArrayBuffer(contentBase64);
  } catch {
    return fail(c, 400, "invalid_base64");
  }

  const contentHash = await sha256HexBytes(buffer);
  const existing = await getImageByPageUrl(c.env.KB_DB, pageId, url);
  if (existing !== null && existing.content_hash === contentHash) {
    const body: StoreImageResponse = { imageId: existing.id };
    return c.json(body, 200);
  }

  // Identity stays stable across re-uploads (supersede-in-place); a fresh image
  // gets a new id whose deterministic R2 key matches the row, while an updated
  // one reuses its existing r2_key so the prior blob isn't orphaned.
  const imageId = existing?.id ?? newId();
  const { id, r2Key } = await upsertImageByPageUrl(c.env.KB_DB, {
    id: imageId,
    pageId,
    url,
    contentHash,
    r2Key: imageKey(imageId),
    altText: altText ?? null,
  });

  const store = createObjectStore(c.env);
  await store.put(r2Key, buffer, { contentType });

  const body: StoreImageResponse = { imageId: id };
  return c.json(body, existing === null ? 201 : 200);
};
