import type { Handler } from "hono";
import type { AuthVariables, Env } from "../../types/env.ts";
import { revokeSession } from "../../repo/sessions.ts";

export const logoutHandler: Handler<{ Bindings: Env; Variables: AuthVariables }> = async (c) => {
  const { sessionId } = c.var.session;
  await revokeSession(c.env.ACCOUNTS_DB, sessionId, Date.now());
  return c.body(null, 204);
};
