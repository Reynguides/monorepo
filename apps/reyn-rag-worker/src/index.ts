import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";
import { requireIngestKey } from "./lib/ingest-auth.ts";
import { storeSourceHandler } from "./handlers/kb/sources.ts";
import { storePageHandler } from "./handlers/kb/pages-write.ts";
import { storeImageHandler } from "./handlers/kb/images-write.ts";
import { getPageHandler, listPagesHandler } from "./handlers/kb/pages-read.ts";
import { getImageHandler } from "./handlers/kb/images-read.ts";
import { verifyHandler } from "./handlers/kb/verify.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

// KB writes — ingestion-key gated (ADR-0014).
app.post("/v1/kb/sources", requireIngestKey, storeSourceHandler);
app.post("/v1/kb/pages", requireIngestKey, storePageHandler);
app.post("/v1/kb/images", requireIngestKey, storeImageHandler);

// KB reads — open (ADR-0014).
app.get("/v1/kb/pages", listPagesHandler);
app.get("/v1/kb/pages/:id", getPageHandler);
app.get("/v1/kb/images/:id", getImageHandler);
app.get("/v1/kb/verify", verifyHandler);

export default app;
