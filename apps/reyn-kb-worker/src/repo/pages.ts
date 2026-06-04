/** D1 wrapper for `pages` — structured page metadata, identity = (source_id, url). */

export interface PageRow {
  id: string;
  source_id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  page_type: string;
  summary: string | null;
  tags: string;
  language: string;
  attribution: string | null;
  content_hash: string;
  r2_raw_key: string | null;
  r2_md_key: string | null;
  lifecycle: string;
  version: number;
  crawled_at: number;
  updated_at: number;
}

export interface PageUpsertInput {
  id: string;
  sourceId: string;
  url: string;
  title?: string | null;
  pageType?: string;
  contentHash: string;
  r2RawKey?: string | null;
  crawledAt: number;
  updatedAt: number;
}

export interface PageUpsertResult {
  id: string;
  isNew: boolean;
}

export async function getPageById(db: D1Database, id: string): Promise<PageRow | null> {
  return await db.prepare("SELECT * FROM pages WHERE id = ?").bind(id).first<PageRow>();
}

export async function getPageBySourceUrl(
  db: D1Database,
  sourceId: string,
  url: string,
): Promise<PageRow | null> {
  return await db
    .prepare("SELECT * FROM pages WHERE source_id = ? AND url = ?")
    .bind(sourceId, url)
    .first<PageRow>();
}

/**
 * Upsert a page by (source_id, url). On an existing row the stable `id` is
 * preserved (re-using it for chunk/vector identity) and the mutable fields +
 * version are updated; otherwise the provided `id` is inserted. Returns the
 * effective id and whether the row was newly created.
 */
export async function upsertPageByUrl(
  db: D1Database,
  input: PageUpsertInput,
): Promise<PageUpsertResult> {
  const existing = await getPageBySourceUrl(db, input.sourceId, input.url);
  if (existing) {
    await db
      .prepare(
        `UPDATE pages SET title = ?, page_type = ?, content_hash = ?, r2_raw_key = ?,
           version = version + 1, updated_at = ? WHERE id = ?`,
      )
      .bind(
        input.title ?? null,
        input.pageType ?? "article",
        input.contentHash,
        input.r2RawKey ?? null,
        input.updatedAt,
        existing.id,
      )
      .run();
    return { id: existing.id, isNew: false };
  }
  await db
    .prepare(
      `INSERT INTO pages (id, source_id, url, title, page_type, content_hash, r2_raw_key, crawled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.sourceId,
      input.url,
      input.title ?? null,
      input.pageType ?? "article",
      input.contentHash,
      input.r2RawKey ?? null,
      input.crawledAt,
      input.updatedAt,
    )
    .run();
  return { id: input.id, isNew: true };
}

export interface PageListResult {
  pages: PageRow[];
  nextCursor: string | null;
}

/** List pages for a source, cursor-paginated by id (opaque cursor = last id). */
export async function listPagesBySource(
  db: D1Database,
  sourceId: string,
  limit: number,
  cursor: string | null,
): Promise<PageListResult> {
  const rows = await db
    .prepare(`SELECT * FROM pages WHERE source_id = ? AND id > ? ORDER BY id LIMIT ?`)
    .bind(sourceId, cursor ?? "", limit)
    .all<PageRow>();
  const pages = rows.results;
  const nextCursor =
    pages.length === limit && pages.length > 0 ? pages[pages.length - 1]!.id : null;
  return { pages, nextCursor };
}

export async function listAllPages(db: D1Database): Promise<PageRow[]> {
  const rows = await db.prepare("SELECT * FROM pages ORDER BY id").all<PageRow>();
  return rows.results;
}
