/**
 * `sessions` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/accounts-d1/0001_init.sql.
 */
export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface NewSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}

export async function insertSession(db: D1Database, session: NewSession): Promise<void> {
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)",
    )
    .bind(session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt)
    .run();
}

/** Returns the row only when not revoked AND not expired at `nowMs`. */
export async function findActiveSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
  nowMs: number,
): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      "SELECT id, user_id, token_hash, created_at, expires_at, revoked_at FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
    )
    .bind(tokenHash, nowMs)
    .first<SessionRow>();
  return row ?? null;
}

export async function revokeSession(
  db: D1Database,
  sessionId: string,
  nowMs: number,
): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(nowMs, sessionId)
    .run();
}
