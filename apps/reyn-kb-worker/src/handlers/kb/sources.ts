import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { StoreSourceRequest } from "../../schemas/kb.ts";
import { upsertSource } from "../../repo/sources.ts";

/** POST /v1/kb/sources (ingest-key gated) — register/upsert a crawl source. */
export const storeSourceHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StoreSourceRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { id, name, baseUrl, tier, license } = parsed.data;
  await upsertSource(c.env.KB_DB, {
    id,
    name,
    baseUrl,
    tier,
    license: license ?? null,
    createdAt: Date.now(),
  });
  return c.json({ sourceId: id }, 200);
};
