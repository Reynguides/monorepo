import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { LoginRequest, type AuthResponse } from "../../schemas/auth.ts";
import { verifyPassword } from "../../lib/password.ts";
import { generateToken, hashToken } from "../../lib/token.ts";
import { fail } from "../../lib/errors.ts";
import { findUserByEmail } from "../../repo/users.ts";
import { insertSession } from "../../repo/sessions.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const loginHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = LoginRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { email, password } = parsed.data;

  const pepper = c.env.SESSION_PEPPER;
  if (!pepper) {
    return fail(c, 500, "server_misconfigured", "SESSION_PEPPER is not set");
  }

  const user = await findUserByEmail(c.env.ACCOUNTS_DB, email);
  if (!user) {
    return fail(c, 401, "invalid_credentials");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return fail(c, 401, "invalid_credentials");
  }

  const token = generateToken();
  const tokenHash = await hashToken(token, pepper);
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await insertSession(c.env.ACCOUNTS_DB, {
    id: sessionId,
    userId: user.id,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  const body: AuthResponse = {
    userId: user.id,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
  return c.json(body, 200);
};
