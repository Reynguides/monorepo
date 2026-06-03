/**
 * `sources` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 */

export interface SourceRow {
  id: string;
  name: string;
  base_url: string;
  tier: number;
  created_at: number;
}

export interface NewSource {
  id: string;
  name: string;
  base_url: string;
  tier: number;
}

export async function insertSource(
  db: D1Database,
  source: NewSource,
  nowMs: number,
): Promise<void> {
  await db
    .prepare("INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(source.id, source.name, source.base_url, source.tier, nowMs)
    .run();
}

/**
 * Idempotent registration keyed on the source id (the PK). Re-registering the
 * same id is a no-op — `INSERT OR IGNORE` leaves the existing row (and its
 * `created_at`) untouched rather than erroring or duplicating. Returns the
 * effective id so callers always get the registered identity back.
 */
export async function upsertSource(
  db: D1Database,
  source: NewSource,
  nowMs: number,
): Promise<string> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(source.id, source.name, source.base_url, source.tier, nowMs)
    .run();
  return source.id;
}

export async function getSourceById(db: D1Database, id: string): Promise<SourceRow | null> {
  const row = await db
    .prepare("SELECT id, name, base_url, tier, created_at FROM sources WHERE id = ?")
    .bind(id)
    .first<SourceRow>();
  return row ?? null;
}

export async function listSources(db: D1Database): Promise<SourceRow[]> {
  const rows = await db
    .prepare("SELECT id, name, base_url, tier, created_at FROM sources ORDER BY created_at, id")
    .all<SourceRow>();
  return rows.results;
}
