import type { Handler } from "hono";
import type { AuthVariables, Env } from "../../types/env.ts";
import type { MeResponse } from "../../schemas/auth.ts";
import { fail } from "../../lib/errors.ts";
import { findUserById } from "../../repo/users.ts";

export const meHandler: Handler<{ Bindings: Env; Variables: AuthVariables }> = async (c) => {
  const { userId } = c.var.session;
  const user = await findUserById(c.env.ACCOUNTS_DB, userId);
  /* istanbul ignore if -- defensive: a valid session pointing at a deleted
     user requires FK enforcement to have been bypassed, which production
     paths cannot do. Verified by the FK-off test in me.test.ts when it can
     successfully orphan a session. */
  if (!user) {
    return fail(c, 401, "unauthorized");
  }
  const body: MeResponse = { userId: user.id, email: user.email };
  return c.json(body, 200);
};
