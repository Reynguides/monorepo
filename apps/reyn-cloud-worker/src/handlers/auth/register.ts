import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { RegisterRequest, type AuthResponse } from "../../schemas/auth.ts";
import { hashPassword } from "../../lib/password.ts";
import { generateToken, hashToken } from "../../lib/token.ts";
import { fail } from "../../lib/errors.ts";
import { insertUser } from "../../repo/users.ts";
import { insertSession } from "../../repo/sessions.ts";

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

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  // Rely on the UNIQUE(email) constraint for dedupe. A pre-check would save a
  // hash on collision but obscures the canonical conflict source.
  try {
    await insertUser(c.env.ACCOUNTS_DB, { id: userId, email, password_hash: passwordHash }, now);
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return fail(c, 409, "email_already_exists");
    }
    /* istanbul ignore next -- non-UNIQUE D1 errors would require a stubbed
       D1 binding to trigger; rare and out of scope for Phase 3 tests. */
    throw e;
  }

  const token = generateToken();
  const tokenHash = await hashToken(token, pepper);
  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;

  await insertSession(c.env.ACCOUNTS_DB, {
    id: sessionId,
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  const body: AuthResponse = {
    userId,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
  return c.json(body, 201);
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}
