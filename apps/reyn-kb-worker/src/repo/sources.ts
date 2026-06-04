/** D1 wrapper for the `sources` catalog. Thin prepared-statement helpers. */

export interface SourceRow {
  id: string;
  name: string;
  base_url: string;
  tier: number;
  license: string | null;
  created_at: number;
}

export interface SourceInput {
  id: string;
  name: string;
  baseUrl: string;
  tier: number;
  license?: string | null;
  createdAt: number;
}

/** Insert a source, or update its mutable fields if the id already exists. */
export async function upsertSource(db: D1Database, input: SourceInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sources (id, name, base_url, tier, license, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, base_url = excluded.base_url,
         tier = excluded.tier, license = excluded.license`,
    )
    .bind(input.id, input.name, input.baseUrl, input.tier, input.license ?? null, input.createdAt)
    .run();
}

export async function getSourceById(db: D1Database, id: string): Promise<SourceRow | null> {
  return await db.prepare("SELECT * FROM sources WHERE id = ?").bind(id).first<SourceRow>();
}

export async function listSources(db: D1Database): Promise<SourceRow[]> {
  const rows = await db.prepare("SELECT * FROM sources ORDER BY tier, id").all<SourceRow>();
  return rows.results;
}
