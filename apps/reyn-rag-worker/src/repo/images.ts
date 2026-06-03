/**
 * `images` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 *
 * Image identity is `(page_id, url)`: `upsertImageByPageUrl` inserts a fresh row
 * when absent and otherwise UPDATEs the existing row in place (same `id`).
 */

export interface ImageRow {
  id: string;
  page_id: string;
  url: string;
  content_hash: string;
  r2_key: string;
  alt_text: string | null;
}

const IMAGE_COLS = "id, page_id, url, content_hash, r2_key, alt_text";

export async function getImageById(db: D1Database, id: string): Promise<ImageRow | null> {
  const row = await db
    .prepare(`SELECT ${IMAGE_COLS} FROM images WHERE id = ?`)
    .bind(id)
    .first<ImageRow>();
  return row ?? null;
}

export async function getImageByPageUrl(
  db: D1Database,
  pageId: string,
  url: string,
): Promise<ImageRow | null> {
  const row = await db
    .prepare(`SELECT ${IMAGE_COLS} FROM images WHERE page_id = ? AND url = ?`)
    .bind(pageId, url)
    .first<ImageRow>();
  return row ?? null;
}

export interface UpsertImageInput {
  /** Id to use when inserting a new row. Ignored on update (existing id wins). */
  id: string;
  pageId: string;
  url: string;
  contentHash: string;
  r2Key: string;
  altText: string | null;
}

/**
 * Returns the persisted image id. On a fresh `(page_id, url)` inserts with the
 * caller-supplied id + `r2Key`; otherwise UPDATEs content_hash/alt_text in place
 * but keeps the existing `r2_key` so the stored blob isn't orphaned. The caller
 * supplies the id so its deterministic R2 key (`images/{id}.bin`) matches the row.
 */
export async function upsertImageByPageUrl(
  db: D1Database,
  input: UpsertImageInput,
): Promise<{ id: string; r2Key: string }> {
  const existing = await getImageByPageUrl(db, input.pageId, input.url);
  if (existing === null) {
    await db
      .prepare(
        `INSERT INTO images (id, page_id, url, content_hash, r2_key, alt_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(input.id, input.pageId, input.url, input.contentHash, input.r2Key, input.altText)
      .run();
    return { id: input.id, r2Key: input.r2Key };
  }
  await db
    .prepare(`UPDATE images SET content_hash = ?, alt_text = ? WHERE id = ?`)
    .bind(input.contentHash, input.altText, existing.id)
    .run();
  return { id: existing.id, r2Key: existing.r2_key };
}

export async function listImagesByPage(db: D1Database, pageId: string): Promise<ImageRow[]> {
  const rows = await db
    .prepare(`SELECT ${IMAGE_COLS} FROM images WHERE page_id = ? ORDER BY id`)
    .bind(pageId)
    .all<ImageRow>();
  return rows.results;
}

export async function listAllImages(db: D1Database): Promise<ImageRow[]> {
  const rows = await db.prepare(`SELECT ${IMAGE_COLS} FROM images ORDER BY id`).all<ImageRow>();
  return rows.results;
}
