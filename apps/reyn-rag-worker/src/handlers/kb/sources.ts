import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { newId } from "../../lib/id.ts";
import { StoreSourceRequest, type StoreSourceResponse } from "../../schemas/kb.ts";
import { getSourceById, upsertSource } from "../../repo/sources.ts";

/**
 * POST /v1/kb/sources (ingest-key gated) → registers a source, returns
 * {sourceId}. Registration is idempotent: a caller may supply a stable `id`
 * (e.g. the catalog id "bg3-wiki") so the crawler can register-then-crawl
 * safely on every run. When `id` is omitted a random UUID is minted. Re-POSTing
 * the same id is a no-op (200) that preserves the existing row; a freshly
 * created source returns 201.
 */
export const storeSourceHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StoreSourceRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { id, name, baseUrl, tier } = parsed.data;

  // Explicit id makes registration idempotent; absent id mints a fresh UUID
  // (which can never collide, so creation is always new).
  const isExplicit = id !== undefined;
  const sourceId = id ?? newId();
  const existing = isExplicit ? await getSourceById(c.env.KB_DB, sourceId) : null;
  await upsertSource(c.env.KB_DB, { id: sourceId, name, base_url: baseUrl, tier }, Date.now());

  const body: StoreSourceResponse = { sourceId };
  return c.json(body, existing === null ? 201 : 200);
};
