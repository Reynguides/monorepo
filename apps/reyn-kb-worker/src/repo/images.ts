/** D1 wrapper for `images` + `chunk_images` — retrievable, chunk-linked images. */

export interface ImageRow {
  id: string;
  page_id: string;
  section_id: string | null;
  url: string;
  content_hash: string;
  r2_key: string;
  content_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

export interface ImageInput {
  id: string;
  pageId: string;
  sectionId?: string | null;
  url: string;
  contentHash: string;
  r2Key: string;
  contentType: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ImageUpsertResult {
  id: string;
  isNew: boolean;
}

/** Upsert an image by (page_id, url), preserving the existing id + r2_key. */
export async function upsertImageByPageUrl(
  db: D1Database,
  input: ImageInput,
): Promise<ImageUpsertResult> {
  const existing = await db
    .prepare("SELECT id FROM images WHERE page_id = ? AND url = ?")
    .bind(input.pageId, input.url)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare("UPDATE images SET content_hash = ?, content_type = ?, alt_text = ? WHERE id = ?")
      .bind(input.contentHash, input.contentType, input.altText ?? null, existing.id)
      .run();
    return { id: existing.id, isNew: false };
  }
  await db
    .prepare(
      `INSERT INTO images
         (id, page_id, section_id, url, content_hash, r2_key, content_type, alt_text, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.pageId,
      input.sectionId ?? null,
      input.url,
      input.contentHash,
      input.r2Key,
      input.contentType,
      input.altText ?? null,
      input.width ?? null,
      input.height ?? null,
    )
    .run();
  return { id: input.id, isNew: true };
}

export async function getImageById(db: D1Database, id: string): Promise<ImageRow | null> {
  return await db.prepare("SELECT * FROM images WHERE id = ?").bind(id).first<ImageRow>();
}

export async function getImageByPageUrl(
  db: D1Database,
  pageId: string,
  url: string,
): Promise<ImageRow | null> {
  return await db
    .prepare("SELECT * FROM images WHERE page_id = ? AND url = ?")
    .bind(pageId, url)
    .first<ImageRow>();
}

export async function listImagesByPage(db: D1Database, pageId: string): Promise<ImageRow[]> {
  const rows = await db
    .prepare("SELECT * FROM images WHERE page_id = ? ORDER BY url")
    .bind(pageId)
    .all<ImageRow>();
  return rows.results;
}

export async function linkChunkImage(
  db: D1Database,
  chunkId: string,
  imageId: string,
): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO chunk_images (chunk_id, image_id) VALUES (?, ?)")
    .bind(chunkId, imageId)
    .run();
}

/** `chunk_images` links pointing at a missing chunk or image — drift (verify, P8). */
export async function countDanglingChunkImages(db: D1Database): Promise<number> {
  return (await db
    .prepare(
      `SELECT count(*) AS n FROM chunk_images ci
       WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.id = ci.chunk_id)
          OR NOT EXISTS (SELECT 1 FROM images i WHERE i.id = ci.image_id)`,
    )
    .first<{ n: number }>())!.n;
}

export async function listImagesByChunk(db: D1Database, chunkId: string): Promise<ImageRow[]> {
  const rows = await db
    .prepare(
      `SELECT i.* FROM images i
       JOIN chunk_images ci ON ci.image_id = i.id
       WHERE ci.chunk_id = ? ORDER BY i.url`,
    )
    .bind(chunkId)
    .all<ImageRow>();
  return rows.results;
}
