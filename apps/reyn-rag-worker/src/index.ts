import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";
import { ragQueryHandler } from "./handlers/rag/query.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

// RAG query — open read. Retrieval delegated to the KB worker's search API;
// generation via the LLM seam (mock by default, OpenRouter opt-in).
app.post("/v1/rag/query", ragQueryHandler);

export default app;
