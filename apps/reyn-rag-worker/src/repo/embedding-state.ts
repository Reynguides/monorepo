/**
 * `embedding_state` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 *
 * This is the authoritative ledger of which chunk was embedded into which
 * model's index under which Vectorize `vector_id` (ADR-0016). Vectorize has no
 * list/scan API, so this ledger is the ONLY way to find a page's vector ids in
 * order to `deleteByIds` them on supersede or to spot-check them in `verify`.
 * PK is `(chunk_id, model)` so a chunk can be embedded by multiple models.
 */

export interface EmbeddingStateRow {
  chunk_id: string;
  model: string;
  vector_id: string;
  indexed_at: number;
}

export interface NewEmbeddingState {
  chunkId: string;
  model: string;
  vectorId: string;
  indexedAt: number;
}

const ES_COLS = "chunk_id, model, vector_id, indexed_at";

/** Inserts a batch of embedding-state ledger rows. */
export async function insertEmbeddingState(
  db: D1Database,
  rows: readonly NewEmbeddingState[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const stmt = db.prepare(
    `INSERT INTO embedding_state (chunk_id, model, vector_id, indexed_at)
     VALUES (?, ?, ?, ?)`,
  );
  await db.batch(rows.map((r) => stmt.bind(r.chunkId, r.model, r.vectorId, r.indexedAt)));
}

/** Ledger rows for a page's chunks (join chunks → embedding_state by chunk_id). */
export async function getEmbeddingStateByPageId(
  db: D1Database,
  pageId: string,
): Promise<EmbeddingStateRow[]> {
  const rows = await db
    .prepare(
      `SELECT es.chunk_id, es.model, es.vector_id, es.indexed_at
       FROM embedding_state es
       JOIN chunks c ON c.id = es.chunk_id
       WHERE c.page_id = ?
       ORDER BY c.ord`,
    )
    .bind(pageId)
    .all<EmbeddingStateRow>();
  return rows.results;
}

/** Vector ids backing a page's chunks (the supersede delete set; ADR-0016). */
export async function listVectorIdsByPageId(db: D1Database, pageId: string): Promise<string[]> {
  const rows = await getEmbeddingStateByPageId(db, pageId);
  return rows.map((r) => r.vector_id);
}

/** Deletes ledger rows for the given chunk ids (supersede cleanup). */
export async function deleteEmbeddingStateByChunkIds(
  db: D1Database,
  chunkIds: readonly string[],
): Promise<void> {
  if (chunkIds.length === 0) {
    return;
  }
  const placeholders = chunkIds.map(() => "?").join(", ");
  await db
    .prepare(`DELETE FROM embedding_state WHERE chunk_id IN (${placeholders})`)
    .bind(...chunkIds)
    .run();
}

/** Ledger rows for the given chunk ids (verify reconciliation). */
export async function getByChunkIds(
  db: D1Database,
  chunkIds: readonly string[],
): Promise<EmbeddingStateRow[]> {
  if (chunkIds.length === 0) {
    return [];
  }
  const placeholders = chunkIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT ${ES_COLS} FROM embedding_state WHERE chunk_id IN (${placeholders})`)
    .bind(...chunkIds)
    .all<EmbeddingStateRow>();
  return rows.results;
}

/**
 * Chunk ids that have NO embedding_state row for the given model — i.e. chunks
 * that were never embedded (drift). Returns ids in (page, ord) order.
 */
export async function listChunkIdsLackingEmbedding(
  db: D1Database,
  model: string,
): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT c.id AS id
       FROM chunks c
       LEFT JOIN embedding_state es ON es.chunk_id = c.id AND es.model = ?
       WHERE es.chunk_id IS NULL
       ORDER BY c.page_id, c.ord`,
    )
    .bind(model)
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}
