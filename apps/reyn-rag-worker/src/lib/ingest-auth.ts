import type { MiddlewareHandler } from "hono";
import type { Env } from "../types/env.ts";
import { fail } from "./errors.ts";

/**
 * Hono middleware gating KB write/ingest endpoints (ADR-0014): reads are open,
 * writes require `Authorization: Bearer <KB_INGEST_KEY>`. Mirrors the shape of
 * apps/reyn-cloud-worker/src/lib/auth-middleware.ts.
 *
 * - `KB_INGEST_KEY` unset → 500 `server_misconfigured` (fail fast; a publicly
 *   routable worker with no key configured must not silently accept writes).
 * - missing / malformed / wrong bearer → 401 `unauthorized`.
 */
export const requireIngestKey: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const expected = c.env.KB_INGEST_KEY;
  if (!expected) {
    return fail(c, 500, "server_misconfigured", "KB_INGEST_KEY is not set");
  }

  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return fail(c, 401, "unauthorized");
  }
  const key = header.slice("Bearer ".length).trim();
  if (key.length === 0 || key !== expected) {
    return fail(c, 401, "unauthorized");
  }

  await next();
  return undefined;
};
