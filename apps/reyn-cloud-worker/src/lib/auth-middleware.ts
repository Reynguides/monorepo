import type { MiddlewareHandler } from "hono";
import type { AuthVariables, Env } from "../types/env.ts";
import { hashToken } from "./token.ts";
import { findActiveSessionByTokenHash } from "../repo/sessions.ts";
import { fail } from "./errors.ts";

/**
 * Hono middleware: requires an `Authorization: Bearer <token>` header
 * mapping to an unrevoked, unexpired session row in ACCOUNTS_DB.
 *
 * On success, sets `c.var.session = { sessionId, userId }`.
 */
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return fail(c, 401, "unauthorized");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return fail(c, 401, "unauthorized");
  }

  const pepper = c.env.SESSION_PEPPER;
  if (!pepper) {
    return fail(c, 500, "server_misconfigured", "SESSION_PEPPER is not set");
  }

  const tokenHash = await hashToken(token, pepper);
  const session = await findActiveSessionByTokenHash(c.env.ACCOUNTS_DB, tokenHash, Date.now());
  if (!session) {
    return fail(c, 401, "unauthorized");
  }

  c.set("session", { sessionId: session.id, userId: session.user_id });
  await next();
  return undefined;
};
