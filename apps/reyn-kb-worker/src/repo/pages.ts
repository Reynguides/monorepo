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
  canonicalUrl?: string | null;
  title?: string | null;
  pageType?: string;
  summary?: string | null;
  language?: string;
  tags?: readonly string[];
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
  const canonicalUrl = input.canonicalUrl ?? input.url;
  const language = input.language ?? "en";
  const tags = JSON.stringify(input.tags ?? []);
  const pageType = input.pageType ?? "article";
  const title = input.title ?? null;
  const summary = input.summary ?? null;
  const r2RawKey = input.r2RawKey ?? null;
  const existing = await getPageBySourceUrl(db, input.sourceId, input.url);
  if (existing) {
    await db
      .prepare(
        `UPDATE pages SET canonical_url = ?, title = ?, page_type = ?, summary = ?, language = ?,
           tags = ?, content_hash = ?, r2_raw_key = ?, version = version + 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        canonicalUrl,
        title,
        pageType,
        summary,
        language,
        tags,
        input.contentHash,
        r2RawKey,
        input.updatedAt,
        existing.id,
      )
      .run();
    return { id: existing.id, isNew: false };
  }
  await db
    .prepare(
      `INSERT INTO pages (id, source_id, url, canonical_url, title, page_type, summary, language,
         tags, content_hash, r2_raw_key, crawled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.sourceId,
      input.url,
      canonicalUrl,
      title,
      pageType,
      summary,
      language,
      tags,
      input.contentHash,
      r2RawKey,
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

/** Batch-load pages by id into a map (search hydration). */
export async function getPagesByIds(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, PageRow>> {
  const map = new Map<string, PageRow>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT * FROM pages WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<PageRow>();
  for (const r of rows.results) map.set(r.id, r);
  return map;
}

export interface PageRef {
  id: string;
  canonical_url: string | null;
  content_hash: string;
}

/** Lightweight (id, canonical_url, content_hash) refs for a source's pages,
 *  excluding `excludeUrl` — feeds the dedup rule phase at the write boundary. */
export async function listPageRefsBySource(
  db: D1Database,
  sourceId: string,
  excludeUrl: string,
): Promise<PageRef[]> {
  const rows = await db
    .prepare("SELECT id, canonical_url, content_hash FROM pages WHERE source_id = ? AND url != ?")
    .bind(sourceId, excludeUrl)
    .all<PageRef>();
  return rows.results;
}

/** Persist the cleaned-markdown R2 key after indexing (P5). */
export async function setPageMdKey(db: D1Database, id: string, r2MdKey: string): Promise<void> {
  await db.prepare("UPDATE pages SET r2_md_key = ? WHERE id = ?").bind(r2MdKey, id).run();
}

/** Resolve a batch of same-source urls to their page ids (link-edge resolution). */
export async function mapUrlsToPageIds(
  db: D1Database,
  sourceId: string,
  urls: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (urls.length === 0) return map;
  const placeholders = urls.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT id, url FROM pages WHERE source_id = ? AND url IN (${placeholders})`)
    .bind(sourceId, ...urls)
    .all<{ id: string; url: string }>();
  for (const r of rows.results) map.set(r.url, r.id);
  return map;
}

/** Update a page's lifecycle (e.g. mark `deprecated` on a conflict loser, P6). */
export async function setPageLifecycle(
  db: D1Database,
  id: string,
  lifecycle: string,
): Promise<void> {
  await db.prepare("UPDATE pages SET lifecycle = ? WHERE id = ?").bind(lifecycle, id).run();
}
