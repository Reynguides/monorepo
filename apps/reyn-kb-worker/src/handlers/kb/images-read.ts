import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { getImageById } from "../../repo/images.ts";
import { createObjectStore } from "../../store/factory.ts";

/**
 * GET /v1/kb/images/:id (open) — stream the image bytes from R2 with the stored
 * content-type. Hardened against stored-XSS: nosniff + a restrictive CSP +
 * inline disposition, so a served blob can never execute as a document.
 */
export const getImageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const id = c.req.param("id")!;
  const img = await getImageById(c.env.KB_DB, id);
  if (img === null) {
    return fail(c, 404, "image_not_found");
  }
  const store = createObjectStore(c.env);
  const bytes = await store.getBytes(img.r2_key);
  if (bytes === null) {
    return fail(c, 404, "image_bytes_missing");
  }
  return c.body(bytes.body, 200, {
    "Content-Type": bytes.contentType ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  });
};
