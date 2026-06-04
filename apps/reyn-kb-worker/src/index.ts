import { Hono } from "hono";
import type { Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";
import { requireIngestKey } from "./lib/ingest-auth.ts";
import { storeSourceHandler } from "./handlers/kb/sources.ts";
import { storePageHandler } from "./handlers/kb/pages-write.ts";
import { getPageHandler, listPagesHandler } from "./handlers/kb/pages-read.ts";
import { storeImageHandler } from "./handlers/kb/images-write.ts";
import { getImageHandler } from "./handlers/kb/images-read.ts";
import { indexPageHandler } from "./handlers/kb/index-page.ts";
import { searchHandler } from "./handlers/kb/search.ts";
import { verifyHandler } from "./handlers/kb/verify.ts";
import { statsHandler } from "./handlers/kb/stats.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/v1/health", healthHandler);

// KB writes — ingest-key gated (ADR-0017).
app.post("/v1/kb/sources", requireIngestKey, storeSourceHandler);
app.post("/v1/kb/pages", requireIngestKey, storePageHandler);
app.post("/v1/kb/images", requireIngestKey, storeImageHandler);
app.post("/v1/kb/pages/:id/index", requireIngestKey, indexPageHandler);

// KB reads — open.
app.get("/v1/kb/pages", listPagesHandler);
app.get("/v1/kb/pages/:id", getPageHandler);
app.get("/v1/kb/images/:id", getImageHandler);
app.post("/v1/kb/search", searchHandler);
app.get("/v1/kb/verify", verifyHandler);
app.get("/v1/kb/stats", statsHandler);

export default app;
