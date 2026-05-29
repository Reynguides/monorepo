/**
 * `user_databases` table — maps userId → the user's dedicated (or shared) D1.
 * Populated by the register flow after the provisioner returns a handle.
 * Phase 5 will add the read-side helpers needed by sync push/pull.
 */

export interface UserDatabaseRow {
  user_id: string;
  database_id: string;
  region: string | null;
  created_at: number;
}

export async function insertUserDatabase(
  db: D1Database,
  userId: string,
  databaseId: string,
  region: string | undefined,
  nowMs: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO user_databases (user_id, database_id, region, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(userId, databaseId, region ?? null, nowMs)
    .run();
}

