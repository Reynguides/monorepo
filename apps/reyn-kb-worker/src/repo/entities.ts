/** D1 wrapper for `entities` — named BG3 things, keyed by (normalized, kind). */

export interface EntityRow {
  id: string;
  kind: string;
  name: string;
  normalized: string;
  canonical_page_id: string | null;
  created_at: number;
}

export interface EntityInput {
  id: string;
  kind: string;
  name: string;
  normalized: string;
  canonicalPageId?: string | null;
  createdAt: number;
}

/** Insert an entity, or refresh name/canonical page if (normalized, kind) exists. */
export async function upsertEntity(db: D1Database, input: EntityInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entities (id, kind, name, normalized, canonical_page_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(normalized, kind) DO UPDATE SET
         name = excluded.name, canonical_page_id = excluded.canonical_page_id`,
    )
    .bind(
      input.id,
      input.kind,
      input.name,
      input.normalized,
      input.canonicalPageId ?? null,
      input.createdAt,
    )
    .run();
}

export async function getEntityByNormalized(
  db: D1Database,
  normalized: string,
  kind: string,
): Promise<EntityRow | null> {
  return await db
    .prepare("SELECT * FROM entities WHERE normalized = ? AND kind = ?")
    .bind(normalized, kind)
    .first<EntityRow>();
}

export async function listEntities(db: D1Database): Promise<EntityRow[]> {
  const rows = await db
    .prepare("SELECT * FROM entities ORDER BY kind, normalized")
    .all<EntityRow>();
  return rows.results;
}
