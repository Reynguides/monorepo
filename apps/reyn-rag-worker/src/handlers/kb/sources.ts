import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { newId } from "../../lib/id.ts";
import { StoreSourceRequest, type StoreSourceResponse } from "../../schemas/kb.ts";
import { insertSource } from "../../repo/sources.ts";

/** POST /v1/kb/sources (ingest-key gated) → inserts a source, returns {sourceId} 201. */
export const storeSourceHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StoreSourceRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { name, baseUrl, tier } = parsed.data;

  const sourceId = newId();
  await insertSource(c.env.KB_DB, { id: sourceId, name, base_url: baseUrl, tier }, Date.now());

  const body: StoreSourceResponse = { sourceId };
  return c.json(body, 201);
};
