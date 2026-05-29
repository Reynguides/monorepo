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

/**
 * Sync push/pull handlers call this to resolve the authenticated user's
 * per-user D1. Under PROVISIONER=shared every user maps to the same
 * `SHARED_USER_DB_ID`; under PROVISIONER=dedicated each user has their own.
 */
export async function findDatabaseIdForUser(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT database_id FROM user_databases WHERE user_id = ?")
    .bind(userId)
    .first<{ database_id: string }>();
  return row?.database_id ?? null;
}

