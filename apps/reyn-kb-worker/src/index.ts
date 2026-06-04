import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";
import { requireIngestKey } from "./lib/ingest-auth.ts";
import { storeSourceHandler } from "./handlers/kb/sources.ts";
import { storePageHandler } from "./handlers/kb/pages-write.ts";
import { getPageHandler, listPagesHandler } from "./handlers/kb/pages-read.ts";
import { storeImageHandler } from "./handlers/kb/images-write.ts";
import { getImageHandler } from "./handlers/kb/images-read.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

// KB writes — ingest-key gated (ADR-0017).
app.post("/v1/kb/sources", requireIngestKey, storeSourceHandler);
app.post("/v1/kb/pages", requireIngestKey, storePageHandler);
app.post("/v1/kb/images", requireIngestKey, storeImageHandler);

// KB reads — open.
app.get("/v1/kb/pages", listPagesHandler);
app.get("/v1/kb/pages/:id", getPageHandler);
app.get("/v1/kb/images/:id", getImageHandler);

// Index (P5) and hybrid search (P7) routes are added in their phases.

export default app;
