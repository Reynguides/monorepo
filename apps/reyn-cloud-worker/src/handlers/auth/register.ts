import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { RegisterRequest, type AuthResponse } from "../../schemas/auth.ts";
import { hashPassword } from "../../lib/password.ts";
import { generateToken, hashToken } from "../../lib/token.ts";
import { fail } from "../../lib/errors.ts";
import { insertUser } from "../../repo/users.ts";
import { insertSession } from "../../repo/sessions.ts";
import { insertUserDatabase } from "../../repo/user-databases.ts";
import { createProvisioner } from "../../provisioning/factory.ts";
import { ProvisioningError, type UserDatabase } from "../../provisioning/types.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const registerHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = RegisterRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { email, password } = parsed.data;

  const pepper = c.env.SESSION_PEPPER;
  if (!pepper) {
    return fail(c, 500, "server_misconfigured", "SESSION_PEPPER is not set");
  }

  let provisioner;
  try {
    provisioner = createProvisioner(c.env);
  } catch (e) {
    if (e instanceof ProvisioningError) {
      return fail(c, 500, "server_misconfigured", e.message);
    }
    /* istanbul ignore next -- non-ProvisioningError factory failure is unreachable. */
    throw e;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  try {
    await insertUser(c.env.ACCOUNTS_DB, { id: userId, email, password_hash: passwordHash }, now);
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return fail(c, 409, "email_already_exists");
    }
    /* istanbul ignore next -- non-UNIQUE D1 errors require a stubbed binding. */
    throw e;
  }

  let userDb: UserDatabase;
  try {
    userDb = await provisioner.provision(userId);
  } catch (e) {
    /* istanbul ignore next -- requires a real provisioner whose .provision()
       throws; the shared/mock test paths don't fail. Phase 5+ may add a
       fault-injection harness if this becomes a regression risk. */
    {
      await c.env.ACCOUNTS_DB.prepare("DELETE FROM users WHERE id = ?")
        .bind(userId)
        .run()
        .catch(() => undefined);
      return fail(c, 500, "provisioning_failed", e instanceof Error ? e.message : undefined);
    }
  }

  await insertUserDatabase(c.env.ACCOUNTS_DB, userId, userDb.databaseId, userDb.region, now);

  const issued = await issueSession(c.env.ACCOUNTS_DB, userId, pepper, now);
  const body: AuthResponse = {
    userId,
    token: issued.token,
    expiresAt: new Date(issued.expiresAt).toISOString(),
  };
  return c.json(body, 201);
};

async function issueSession(
  db: D1Database,
  userId: string,
  pepper: string,
  nowMs: number,
): Promise<{ token: string; expiresAt: number }> {
  const token = generateToken();
  const tokenHash = await hashToken(token, pepper);
  const sessionId = crypto.randomUUID();
  const expiresAt = nowMs + SESSION_TTL_MS;
  await insertSession(db, { id: sessionId, userId, tokenHash, createdAt: nowMs, expiresAt });
  return { token, expiresAt };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}
