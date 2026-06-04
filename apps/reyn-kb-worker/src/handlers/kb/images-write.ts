import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { base64ToArrayBuffer } from "../../lib/base64.ts";
import { sha256HexBytes } from "../../lib/content-hash.ts";
import { newId } from "../../lib/id.ts";
import { StoreImageRequest } from "../../schemas/kb.ts";
import { getPageById } from "../../repo/pages.ts";
import { getImageByPageUrl, upsertImageByPageUrl, type ImageInput } from "../../repo/images.ts";
import { createObjectStore } from "../../store/factory.ts";

function buildImageInput(
  data: StoreImageRequest,
  id: string,
  r2Key: string,
  contentHash: string,
): ImageInput {
  return {
    id,
    pageId: data.pageId,
    url: data.url,
    contentHash,
    r2Key,
    contentType: data.contentType,
    altText: data.altText ?? null,
    width: data.width ?? null,
    height: data.height ?? null,
  };
}

/**
 * POST /v1/kb/images (ingest-key gated). Decodes a base64 image (strict
 * content-type allowlist — no SVG, blocking stored-XSS), hashes the DECODED
 * bytes, stores to R2, and upserts the metadata by (page_id, url). Idempotent:
 * an unchanged byte-hash is a no-op (no R2 write).
 */
export const storeImageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StoreImageRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { pageId, url, contentType, dataBase64 } = parsed.data;
  const db = c.env.KB_DB;
  if ((await getPageById(db, pageId)) === null) {
    return fail(c, 404, "page_not_found");
  }

  let bytes: ArrayBuffer;
  try {
    bytes = base64ToArrayBuffer(dataBase64);
  } catch {
    return fail(c, 400, "invalid_base64");
  }
  const contentHash = await sha256HexBytes(bytes);

  const existing = await getImageByPageUrl(db, pageId, url);
  if (existing !== null && existing.content_hash === contentHash) {
    return c.json({ imageId: existing.id, changed: false }, 200);
  }

  const imageId = existing !== null ? existing.id : newId();
  const r2Key = existing !== null ? existing.r2_key : `images/${imageId}`;
  const store = createObjectStore(c.env);
  await store.put(r2Key, bytes, { contentType });
  const result = await upsertImageByPageUrl(
    db,
    buildImageInput(parsed.data, imageId, r2Key, contentHash),
  );
  return c.json({ imageId: result.id, changed: true }, 200);
};
