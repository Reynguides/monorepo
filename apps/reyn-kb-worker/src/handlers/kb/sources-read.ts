import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { listSources, type SourceRow } from "../../repo/sources.ts";

function toSourceItem(s: SourceRow): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    baseUrl: s.base_url,
    tier: s.tier,
    license: s.license,
    createdAt: s.created_at,
  };
}

/** GET /v1/kb/sources (open) — the registered source catalog, for the browse UI's picker. */
export const listSourcesHandler: Handler<{ Bindings: Env }> = async (c) => {
  const sources = await listSources(c.env.KB_DB);
  return c.json({ sources: sources.map(toSourceItem) }, 200);
};
