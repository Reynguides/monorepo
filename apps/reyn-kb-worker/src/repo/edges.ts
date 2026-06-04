/** D1 wrapper for `page_edges` — the typed page relationship graph. */

export interface EdgeRow {
  id: string;
  src_page_id: string;
  dst_page_id: string | null;
  dst_url: string | null;
  edge_type: string;
  weight: number;
  evidence: string | null;
  created_at: number;
}

export interface EdgeInput {
  id: string;
  srcPageId: string;
  dstPageId?: string | null;
  dstUrl?: string | null;
  edgeType: string;
  weight?: number;
  evidence?: string | null;
  createdAt: number;
}

/** Insert edges, ignoring duplicates on UNIQUE(src_page_id, dst_url, edge_type). */
export async function insertEdges(db: D1Database, edges: readonly EdgeInput[]): Promise<void> {
  if (edges.length === 0) return;
  const statements = edges.map((e) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO page_edges
           (id, src_page_id, dst_page_id, dst_url, edge_type, weight, evidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        e.id,
        e.srcPageId,
        e.dstPageId ?? null,
        e.dstUrl ?? null,
        e.edgeType,
        e.weight ?? 1.0,
        e.evidence ?? null,
        e.createdAt,
      ),
  );
  await db.batch(statements);
}

export async function listEdgesBySrcPage(db: D1Database, srcPageId: string): Promise<EdgeRow[]> {
  const rows = await db
    .prepare("SELECT * FROM page_edges WHERE src_page_id = ? ORDER BY edge_type, weight DESC")
    .bind(srcPageId)
    .all<EdgeRow>();
  return rows.results;
}

export async function deleteEdgesBySrcPage(db: D1Database, srcPageId: string): Promise<void> {
  await db.prepare("DELETE FROM page_edges WHERE src_page_id = ?").bind(srcPageId).run();
}

/** Edges whose resolved dst_page_id no longer points at an existing page (drift). */
export async function listDanglingEdgeIds(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT e.id AS id FROM page_edges e
       WHERE e.dst_page_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.id = e.dst_page_id)`,
    )
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}
