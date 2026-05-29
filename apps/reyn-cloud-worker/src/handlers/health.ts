import type { Handler } from "hono";
import type { Env } from "../types/env.ts";
import type { HealthResponse } from "../schemas/auth.ts";

export const healthHandler: Handler<{ Bindings: Env }> = (c) => {
  const body: HealthResponse = {
    ok: true,
    time: new Date().toISOString(),
  };
  return c.json(body, 200);
};
