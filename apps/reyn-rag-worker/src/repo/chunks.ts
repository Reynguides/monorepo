/**
 * `chunks` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 *
 * A chunk is a retrievable slice of a page's cleaned text in reading order
 * (`ord`). Its `id` doubles as the Vectorize vector id base (the indexer uses
 * `${page_id}:${ord}` as the vector id; see handlers/kb/index-page.ts). On
 * re-index a page's chunks are deleted and rebuilt (supersede; ADR-0016).
 */

export interface ChunkRow {
  id: string;
  page_id: string;
  ord: number;
  text: string;
  content_hash: string;
  token_count: number;
}

export interface NewChunk {
  id: string;
  pageId: string;
  ord: number;
  text: string;
  contentHash: string;
  tokenCount: number;
}

const CHUNK_COLS = "id, page_id, ord, text, content_hash, token_count";

/** Inserts a batch of chunk rows for a page (caller assigns ids + ords). */
export async function insertChunks(db: D1Database, chunks: readonly NewChunk[]): Promise<void> {
  if (chunks.length === 0) {
    return;
  }
  const stmt = db.prepare(
    `INSERT INTO chunks (id, page_id, ord, text, content_hash, token_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(
    chunks.map((ch) => stmt.bind(ch.id, ch.pageId, ch.ord, ch.text, ch.contentHash, ch.tokenCount)),
  );
}

/** Deletes every chunk row for a page (the supersede step before a rebuild). */
export async function deleteChunksByPageId(db: D1Database, pageId: string): Promise<void> {
  await db.prepare("DELETE FROM chunks WHERE page_id = ?").bind(pageId).run();
}

/** Lists a page's chunks in reading order. */
export async function listChunksByPageId(db: D1Database, pageId: string): Promise<ChunkRow[]> {
  const rows = await db
    .prepare(`SELECT ${CHUNK_COLS} FROM chunks WHERE page_id = ? ORDER BY ord`)
    .bind(pageId)
    .all<ChunkRow>();
  return rows.results;
}

/**
 * Fetches chunk rows for an arbitrary set of ids (the matched chunks from a
 * vector query) and returns them in the SAME order as `ids` — preserving the
 * caller's re-ranked order, which D1's `IN (...)` does not. Unknown ids are
 * skipped. An empty `ids` returns `[]` without a query.
 */
export async function getChunksByIds(db: D1Database, ids: readonly string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT ${CHUNK_COLS} FROM chunks WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<ChunkRow>();
  const byId = new Map(rows.results.map((r) => [r.id, r]));
  const ordered: ChunkRow[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row !== undefined) {
      ordered.push(row);
    }
  }
  return ordered;
}

/** Every chunk row across the corpus, ordered by (page, ord) (verify). */
export async function listAllChunks(db: D1Database): Promise<ChunkRow[]> {
  const rows = await db
    .prepare(`SELECT ${CHUNK_COLS} FROM chunks ORDER BY page_id, ord`)
    .all<ChunkRow>();
  return rows.results;
}
