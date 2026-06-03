import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

export default app;
