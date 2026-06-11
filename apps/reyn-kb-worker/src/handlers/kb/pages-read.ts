import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { PageListQuery } from "../../schemas/kb.ts";
import { getPageById, listPagesBySource, type PageRow } from "../../repo/pages.ts";
import { listChunksByPageId } from "../../repo/chunks.ts";
import { getEmbeddingStateByChunkIds } from "../../repo/embedding-state.ts";
import { createObjectStore } from "../../store/factory.ts";

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function toListItem(p: PageRow): Record<string, unknown> {
  return {
    id: p.id,
    url: p.url,
    title: p.title,
    pageType: p.page_type,
    lifecycle: p.lifecycle,
    version: p.version,
    updatedAt: p.updated_at,
  };
}

/** GET /v1/kb/pages/:id (open) — page metadata + raw HTML + cleaned markdown. */
export const getPageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const id = c.req.param("id")!;
  const page = await getPageById(c.env.KB_DB, id);
  if (page === null) {
    return fail(c, 404, "page_not_found");
  }
  const store = createObjectStore(c.env);
  const html = page.r2_raw_key !== null ? await store.get(page.r2_raw_key) : null;
  const markdown = page.r2_md_key !== null ? await store.get(page.r2_md_key) : null;
  return c.json(
    {
      id: page.id,
      sourceId: page.source_id,
      url: page.url,
      canonicalUrl: page.canonical_url,
      title: page.title,
      pageType: page.page_type,
      summary: page.summary,
      tags: parseTags(page.tags),
      language: page.language,
      lifecycle: page.lifecycle,
      version: page.version,
      crawledAt: page.crawled_at,
      updatedAt: page.updated_at,
      html,
      markdown,
    },
    200,
  );
};

/**
 * GET /v1/kb/pages/:id/chunks (open) — a page's retrievable chunks plus, per chunk,
 * whether an embedding ledger row exists. This is the chunk-level "filled in correctly"
 * view: it distinguishes a never-indexed page (empty list) from one whose chunks are all
 * present and embedded. `404` if the page id is unknown.
 */
export const listPageChunksHandler: Handler<{ Bindings: Env }> = async (c) => {
  const id = c.req.param("id")!;
  const page = await getPageById(c.env.KB_DB, id);
  if (page === null) {
    return fail(c, 404, "page_not_found");
  }
  const chunks = await listChunksByPageId(c.env.KB_DB, id);
  const ledger = await getEmbeddingStateByChunkIds(
    c.env.KB_DB,
    chunks.map((ch) => ch.id),
  );
  const embedded = new Set(ledger.map((e) => e.chunk_id));
  return c.json(
    {
      pageId: id,
      chunks: chunks.map((ch) => ({
        id: ch.id,
        sectionId: ch.section_id,
        ord: ch.ord,
        headingPath: ch.heading_path,
        tokenCount: ch.token_count,
        text: ch.text,
        hasEmbedding: embedded.has(ch.id),
      })),
    },
    200,
  );
};

/** GET /v1/kb/pages?source=&limit=&cursor= (open) — paginated page list. */
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
  const result = await listPagesBySource(c.env.KB_DB, source, limit, cursor ?? null);
  return c.json({ items: result.pages.map(toListItem), nextCursor: result.nextCursor }, 200);
};
