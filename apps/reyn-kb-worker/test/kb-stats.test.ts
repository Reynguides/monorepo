import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { setPageLifecycle } from "../src/repo/pages.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

const DOC = `<html><head><title>Fireball</title></head><body>
<h1>Fireball</h1><p>A wizard spell dealing fire damage in a sphere.</p>
<h2>At Higher Levels</h2><p>Add 1d6 fire damage per slot above level 3.</p>
</body></html>`;

interface CorpusStats {
  sources: number;
  pages: number;
  sections: number;
  chunks: number;
  embeddings: number;
  edges: number;
  entities: number;
  pagesByLifecycle: Record<string, number>;
}

async function ingest(url: string): Promise<string> {
  const stored = await readJson<{ pageId: string }>(
    await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId: "s1", url, html: DOC, pageType: "spell" },
    }),
  );
  await call(`/v1/kb/pages/${stored.pageId}/index`, { method: "POST", headers: AUTH });
  return stored.pageId;
}

beforeEach(async () => {
  resetMockVectorIndexClient();
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
});

describe("GET /v1/kb/stats", () => {
  it("reports corpus counts with embeddings matching chunks", async () => {
    await ingest("https://bg3.wiki/Fireball");
    const s = await readJson<CorpusStats>(await call("/v1/kb/stats"));
    expect(s.sources).toBe(1);
    expect(s.pages).toBe(1);
    expect(s.sections).toBeGreaterThan(0);
    expect(s.chunks).toBeGreaterThan(0);
    expect(s.embeddings).toBe(s.chunks);
    expect(s.entities).toBeGreaterThan(0);
    expect(s.pagesByLifecycle.active).toBe(1);
  });

  it("breaks pages down by lifecycle across multiple states", async () => {
    await ingest("https://bg3.wiki/Fireball");
    const deprecated = await ingest("https://bg3.wiki/MagicMissile");
    await setPageLifecycle(env.KB_DB, deprecated, "deprecated");
    const s = await readJson<CorpusStats>(await call("/v1/kb/stats"));
    expect(s.pages).toBe(2);
    expect(s.pagesByLifecycle.active).toBe(1);
    expect(s.pagesByLifecycle.deprecated).toBe(1);
  });
});
