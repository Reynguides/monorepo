/** D1 wrapper for `chunks` — retrievable text slices (id = Vectorize vector id). */

// D1 caps a single query at 100 bound parameters. Search fans out far more
// candidate ids than that (topK * CANDIDATE_FACTOR — 150 at topK=50), so every
// `id IN (…)` lookup is chunked to stay under the cap (cf. `mapUrlsToPageIds`).
const ID_BATCH = 90;

export interface ChunkRow {
  id: string;
  page_id: string;
  section_id: string | null;
  ord: number;
  heading_path: string | null;
  text: string;
  content_hash: string;
  token_count: number;
}

export interface ChunkInput {
  id: string;
  pageId: string;
  sectionId?: string | null;
  ord: number;
  headingPath?: string | null;
  text: string;
  contentHash: string;
  tokenCount: number;
}

export async function insertChunks(db: D1Database, chunks: readonly ChunkInput[]): Promise<void> {
  if (chunks.length === 0) return;
  const statements = chunks.map((c) =>
    db
      .prepare(
        `INSERT INTO chunks (id, page_id, section_id, ord, heading_path, text, content_hash, token_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        c.id,
        c.pageId,
        c.sectionId ?? null,
        c.ord,
        c.headingPath ?? null,
        c.text,
        c.contentHash,
        c.tokenCount,
      ),
  );
  await db.batch(statements);
}

export async function listChunksByPageId(db: D1Database, pageId: string): Promise<ChunkRow[]> {
  const rows = await db
    .prepare("SELECT * FROM chunks WHERE page_id = ? ORDER BY ord")
    .bind(pageId)
    .all<ChunkRow>();
  return rows.results;
}

export async function deleteChunksByPageId(db: D1Database, pageId: string): Promise<void> {
  await db.prepare("DELETE FROM chunks WHERE page_id = ?").bind(pageId).run();
}

/** Fetch chunks by id, returned in the caller's id order (vector matches order). */
export async function getChunksByIds(db: D1Database, ids: readonly string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) return [];
  const byId = new Map<string, ChunkRow>();
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await db
      .prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`)
      .bind(...batch)
      .all<ChunkRow>();
    for (const r of rows.results) byId.set(r.id, r);
  }
  const ordered: ChunkRow[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row !== undefined) ordered.push(row);
  }
  return ordered;
}

/**
 * FTS5 self-integrity check including external-content match (`rank = 1`): verifies
 * the index is internally sound AND consistent with the `chunks` content table, so a
 * missing/extra/mismatched trigger-maintained entry is caught. A `count(*)` comparison
 * cannot detect this — on an external-content table that read passes through to the
 * content table. Returns false on any drift (the check raises `SQLITE_CORRUPT_VTAB`).
 */
export async function ftsIndexConsistent(db: D1Database): Promise<boolean> {
  try {
    await db.prepare("INSERT INTO chunks_fts(chunks_fts, rank) VALUES('integrity-check', 1)").run();
    return true;
  } catch {
    return false;
  }
}

export interface FtsHit {
  id: string;
  score: number;
}

/**
 * BM25 keyword search over the FTS5 index; returns chunk ids best-first (lower
 * bm25 = more relevant). No structured filter here — the caller filters by page
 * fields after hydration (ADR-0023).
 */
export async function searchChunksFts(
  db: D1Database,
  match: string,
  limit: number,
): Promise<FtsHit[]> {
  const rows = await db
    .prepare(
      `SELECT c.id AS id, bm25(chunks_fts) AS score
       FROM chunks_fts JOIN chunks c ON c.rowid = chunks_fts.rowid
       WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?`,
    )
    .bind(match, limit)
    .all<FtsHit>();
  return rows.results;
}
