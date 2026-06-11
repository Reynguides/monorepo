/** D1 wrapper for `embedding_state` — the authoritative chunk -> vector ledger. */

// D1 caps a single query at 100 bound parameters. A page can carry far more than
// 100 chunks (dense walkthrough pages), so every `chunk_id IN (…)` over a page's
// chunk list is chunked to stay under the cap (cf. `mapUrlsToPageIds`).
const ID_BATCH = 90;

export interface EmbeddingStateRow {
  chunk_id: string;
  model: string;
  vector_id: string;
  namespace: string | null;
  indexed_at: number;
}

export interface EmbeddingStateInput {
  chunkId: string;
  model: string;
  vectorId: string;
  namespace?: string | null;
  indexedAt: number;
}

export async function insertEmbeddingState(
  db: D1Database,
  rows: readonly EmbeddingStateInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const statements = rows.map((r) =>
    db
      .prepare(
        `INSERT INTO embedding_state (chunk_id, model, vector_id, namespace, indexed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chunk_id, model) DO UPDATE SET
           vector_id = excluded.vector_id, namespace = excluded.namespace,
           indexed_at = excluded.indexed_at`,
      )
      .bind(r.chunkId, r.model, r.vectorId, r.namespace ?? null, r.indexedAt),
  );
  await db.batch(statements);
}

/** Vector ids backing a page's chunks (for supersede deleteByIds). */
export async function listVectorIdsByPageId(db: D1Database, pageId: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT es.vector_id AS vector_id FROM embedding_state es
       JOIN chunks c ON c.id = es.chunk_id WHERE c.page_id = ?`,
    )
    .bind(pageId)
    .all<{ vector_id: string }>();
  return rows.results.map((r) => r.vector_id);
}

export async function deleteEmbeddingStateByChunkIds(
  db: D1Database,
  chunkIds: readonly string[],
): Promise<void> {
  for (let i = 0; i < chunkIds.length; i += ID_BATCH) {
    const batch = chunkIds.slice(i, i + ID_BATCH);
    const placeholders = batch.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM embedding_state WHERE chunk_id IN (${placeholders})`)
      .bind(...batch)
      .run();
  }
}

export async function getEmbeddingStateByChunkIds(
  db: D1Database,
  chunkIds: readonly string[],
): Promise<EmbeddingStateRow[]> {
  const out: EmbeddingStateRow[] = [];
  for (let i = 0; i < chunkIds.length; i += ID_BATCH) {
    const batch = chunkIds.slice(i, i + ID_BATCH);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await db
      .prepare(`SELECT * FROM embedding_state WHERE chunk_id IN (${placeholders})`)
      .bind(...batch)
      .all<EmbeddingStateRow>();
    out.push(...rows.results);
  }
  return out;
}

/** Chunk ids lacking an embedding row for `model` (drift) — used by verify (P8). */
export async function listChunkIdsLackingEmbedding(
  db: D1Database,
  model: string,
): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT c.id AS id FROM chunks c
       LEFT JOIN embedding_state es ON es.chunk_id = c.id AND es.model = ?
       WHERE es.chunk_id IS NULL`,
    )
    .bind(model)
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/** Ledger rows whose chunk no longer exists (deleted chunk, stale vector) — drift (P8). */
export async function listOrphanEmbeddingChunkIds(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT es.chunk_id AS id FROM embedding_state es
       LEFT JOIN chunks c ON c.id = es.chunk_id
       WHERE c.id IS NULL`,
    )
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/** Ledger rows whose recorded namespace no longer matches the chunk's page type — drift (P8). */
export async function listNamespaceDriftChunkIds(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT es.chunk_id AS id FROM embedding_state es
       JOIN chunks c ON c.id = es.chunk_id
       JOIN pages p ON p.id = c.page_id
       WHERE COALESCE(es.namespace, '') != p.page_type`,
    )
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}
