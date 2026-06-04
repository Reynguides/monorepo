import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

// KB content + search routes are added in subsequent phases (P3 ingestion,
// P5 index, P7 search, P8 verify/stats). Writes will be ingest-key gated
// (ADR-0017); reads stay open.

export default app;
