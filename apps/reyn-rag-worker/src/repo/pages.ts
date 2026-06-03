/**
 * `pages` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 *
 * Page identity is `(source_id, url)` per ADR-0016: `upsertPageByUrl` inserts a
 * fresh row when the URL is new and otherwise UPDATEs the existing row in place
 * (same `id`), so re-crawls supersede rather than duplicate.
 */

export interface PageRow {
  id: string;
  source_id: string;
  url: string;
  title: string | null;
  content_hash: string;
  r2_raw_key: string | null;
  r2_md_key: string | null;
  crawled_at: number;
  updated_at: number;
}

const PAGE_COLS =
  "id, source_id, url, title, content_hash, r2_raw_key, r2_md_key, crawled_at, updated_at";

export async function getPageById(db: D1Database, id: string): Promise<PageRow | null> {
  const row = await db
    .prepare(`SELECT ${PAGE_COLS} FROM pages WHERE id = ?`)
    .bind(id)
    .first<PageRow>();
  return row ?? null;
}

export async function getPageBySourceUrl(
  db: D1Database,
  sourceId: string,
  url: string,
): Promise<PageRow | null> {
  const row = await db
    .prepare(`SELECT ${PAGE_COLS} FROM pages WHERE source_id = ? AND url = ?`)
    .bind(sourceId, url)
    .first<PageRow>();
  return row ?? null;
}

export interface UpsertPageInput {
  /** Id to use when inserting a new row. Ignored on update (existing id wins). */
  id: string;
  sourceId: string;
  url: string;
  title: string | null;
  contentHash: string;
  r2RawKey: string;
}

/**
 * Inserts a new page row using `input.id` when `(source_id, url)` is absent,
 * else UPDATEs the existing row's title/content_hash/r2_raw_key/crawled_at/
 * updated_at keeping its original `id`. Returns the persisted page id. The
 * caller supplies the id so its deterministic R2 key (`pages/{id}/raw.html`)
 * matches the row. `r2_md_key` is left untouched (markdown is Phase 4).
 */
export async function upsertPageByUrl(
  db: D1Database,
  input: UpsertPageInput,
  nowMs: number,
): Promise<string> {
  const existing = await getPageBySourceUrl(db, input.sourceId, input.url);
  if (existing === null) {
    await db
      .prepare(
        `INSERT INTO pages (id, source_id, url, title, content_hash, r2_raw_key, crawled_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.sourceId,
        input.url,
        input.title,
        input.contentHash,
        input.r2RawKey,
        nowMs,
        nowMs,
      )
      .run();
    return input.id;
  }
  await db
    .prepare(
      `UPDATE pages SET title = ?, content_hash = ?, r2_raw_key = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.title, input.contentHash, input.r2RawKey, nowMs, existing.id)
    .run();
  return existing.id;
}

/**
 * Sets a page's normalised-markdown R2 key (the `clean.md` blob produced by the
 * index handler) and bumps `updated_at`. Leaves all other columns untouched.
 */
export async function setPageMdKey(
  db: D1Database,
  pageId: string,
  r2MdKey: string,
  nowMs: number,
): Promise<void> {
  await db
    .prepare("UPDATE pages SET r2_md_key = ?, updated_at = ? WHERE id = ?")
    .bind(r2MdKey, nowMs, pageId)
    .run();
}

export interface PageListResult {
  items: PageRow[];
  nextCursor: string | null;
}

/**
 * Lists pages for a source ordered by id, cursor-paginated. `cursor` is the last
 * id from the previous page (opaque to callers); `nextCursor` is non-null only
 * when a full page was returned (more may exist).
 */
export async function listPagesBySource(
  db: D1Database,
  sourceId: string,
  limit: number,
  cursor: string | null,
): Promise<PageListResult> {
  const stmt =
    cursor === null
      ? db
          .prepare(`SELECT ${PAGE_COLS} FROM pages WHERE source_id = ? ORDER BY id LIMIT ?`)
          .bind(sourceId, limit)
      : db
          .prepare(
            `SELECT ${PAGE_COLS} FROM pages WHERE source_id = ? AND id > ? ORDER BY id LIMIT ?`,
          )
          .bind(sourceId, cursor, limit);
  const rows = await stmt.all<PageRow>();
  const items = rows.results;
  const last = items.at(-1);
  const nextCursor = items.length === limit && last !== undefined ? last.id : null;
  return { items, nextCursor };
}

export async function listAllPages(db: D1Database): Promise<PageRow[]> {
  const rows = await db.prepare(`SELECT ${PAGE_COLS} FROM pages ORDER BY id`).all<PageRow>();
  return rows.results;
}
