import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { UpsertCrawlStateRequest, type CrawlStateResponse } from "../../schemas/crawl.ts";
import { getCrawlState, upsertCrawlState } from "../../repo/crawl-state.ts";

/** Parse the stored TEXT cursor to a non-negative index (default 0). */
function cursorToNumber(cursor: string | null): number {
  if (cursor === null) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * GET /v1/kb/crawl-state/:sourceId (open) → {cursor, status, lastSitemapAt} for
 * the source, or 404 if no crawl has been recorded for it yet.
 */
export const getCrawlStateHandler: Handler<{ Bindings: Env }> = async (c) => {
  /* istanbul ignore next -- :sourceId always matches when this handler runs; the
     ?? "" is a type-narrowing guard only (param() is typed string | undefined). */
  const sourceId = c.req.param("sourceId") ?? "";
  const row = await getCrawlState(c.env.KB_DB, sourceId);
  if (row === null) {
    return fail(c, 404, "crawl_state_not_found");
  }
  const body: CrawlStateResponse = {
    cursor: cursorToNumber(row.cursor),
    status: row.status,
    lastSitemapAt: row.last_sitemap_at,
  };
  return c.json(body, 200);
};

/**
 * POST /v1/kb/crawl-state (ingest-key gated) → upserts a source's crawl
 * progress (cursor + status, optional lastSitemapAt). Returns 200 on success.
 */
export const upsertCrawlStateHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = UpsertCrawlStateRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { sourceId, cursor, status, lastSitemapAt } = parsed.data;

  await upsertCrawlState(c.env.KB_DB, {
    sourceId,
    cursor: String(cursor),
    status,
    ...(lastSitemapAt !== undefined ? { lastSitemapAt } : {}),
  });

  return c.json({ ok: true }, 200);
};
