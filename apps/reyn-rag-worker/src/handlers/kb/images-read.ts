import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { getImageById } from "../../repo/images.ts";
import { createObjectStore } from "../../store/factory.ts";

/**
 * GET /v1/kb/images/:id (open) → streams the stored bytes with the stored
 * content-type. 404 if the row is missing or the R2 object is gone (drift).
 */
export const getImageHandler: Handler<{ Bindings: Env }> = async (c) => {
  /* istanbul ignore next -- :id always matches when this handler runs; the ?? ""
     is a type-narrowing guard only (param() is typed string | undefined). */
  const id = c.req.param("id") ?? "";
  const image = await getImageById(c.env.KB_DB, id);
  if (image === null) {
    return fail(c, 404, "image_not_found");
  }

  const store = createObjectStore(c.env);
  const obj = await store.getBytes(image.r2_key);
  if (obj === null) {
    return fail(c, 404, "image_bytes_missing");
  }

  return c.body(obj.body, 200, {
    "Content-Type": obj.contentType ?? "application/octet-stream",
  });
};
