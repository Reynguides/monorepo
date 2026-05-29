/**
 * `users` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/accounts-d1/0001_init.sql.
 */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface NewUser {
  id: string;
  email: string;
  password_hash: string;
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  return row ?? null;
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, created_at, updated_at FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  /* istanbul ignore next -- the "row missing" branch matches me.ts orphaned-session
     case, identically defensive. */
  return row ?? null;
}

export async function insertUser(db: D1Database, user: NewUser, nowMs: number): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(user.id, user.email, user.password_hash, nowMs, nowMs)
    .run();
}
