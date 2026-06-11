import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { collectCorpusStats } from "../../repo/stats.ts";

/**
 * GET /v1/kb/stats (OPEN). Corpus-wide row counts per entity + a page-lifecycle
 * breakdown — a cheap dashboard/health snapshot (P8).
 */
export const statsHandler: Handler<{ Bindings: Env }> = async (c) => {
  return c.json(await collectCorpusStats(c.env.KB_DB), 200);
};
