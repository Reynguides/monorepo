import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import {
  PageListQuery,
  type PageDetailResponse,
  type PageListItem,
  type PageListResponse,
} from "../../schemas/kb.ts";
import { getPageById, listPagesBySource, type PageRow } from "../../repo/pages.ts";
import { createObjectStore } from "../../store/factory.ts";

function toListItem(p: PageRow): PageListItem {
  return {
    id: p.id,
    sourceId: p.source_id,
    url: p.url,
    title: p.title,
    contentHash: p.content_hash,
    crawledAt: p.crawled_at,
    updatedAt: p.updated_at,
  };
}

/**
 * GET /v1/kb/pages/:id (open) → page metadata + raw `html` (from R2) +
 * `markdown` if `r2_md_key` is set (Phase 4). 404 if the page row is missing.
 */
export const getPageHandler: Handler<{ Bindings: Env }> = async (c) => {
  /* istanbul ignore next -- :id always matches when this handler runs; the ?? ""
     is a type-narrowing guard only (param() is typed string | undefined). */
  const id = c.req.param("id") ?? "";
  const page = await getPageById(c.env.KB_DB, id);
  if (page === null) {
    return fail(c, 404, "page_not_found");
  }

  const store = createObjectStore(c.env);
  const html = page.r2_raw_key !== null ? await store.get(page.r2_raw_key) : null;
  const markdown = page.r2_md_key !== null ? await store.get(page.r2_md_key) : null;

  const body: PageDetailResponse = {
    id: page.id,
    sourceId: page.source_id,
    url: page.url,
    title: page.title,
    contentHash: page.content_hash,
    crawledAt: page.crawled_at,
    updatedAt: page.updated_at,
    html,
    markdown,
  };
  return c.json(body, 200);
};

/**
 * GET /v1/kb/pages?source=<id>&limit=&cursor= (open) → paginated metadata list.
 * `nextCursor` is the id to pass as `cursor` for the next page, or null at end.
 */
export const listPagesHandler: Handler<{ Bindings: Env }> = async (c) => {
  const parsed = PageListQuery.safeParse({
    source: c.req.query("source"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { source, limit, cursor } = parsed.data;

  const page = await listPagesBySource(c.env.KB_DB, source, limit, cursor);
  const body: PageListResponse = {
    items: page.items.map(toListItem),
    nextCursor: page.nextCursor,
  };
  return c.json(body, 200);
};
