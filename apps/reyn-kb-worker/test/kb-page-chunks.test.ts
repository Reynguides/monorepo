import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

const DOC = `<html><head><title>Fireball</title></head><body>
<h1>Fireball</h1><p>A wizard spell dealing fire damage in a sphere.</p>
<h2>At Higher Levels</h2><p>Add 1d6 fire damage per slot above level 3.</p>
</body></html>`;

interface ChunkItem {
  id: string;
  sectionId: string | null;
  ord: number;
  headingPath: string | null;
  tokenCount: number;
  text: string;
  hasEmbedding: boolean;
}
interface ChunkList {
  pageId: string;
  chunks: ChunkItem[];
}

async function storePage(url: string): Promise<string> {
  const stored = await readJson<{ pageId: string }>(
    await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId: "s1", url, html: DOC, pageType: "spell" },
    }),
  );
  return stored.pageId;
}

beforeEach(async () => {
  resetMockVectorIndexClient();
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: 1000,
  });
});

describe("GET /v1/kb/pages/:id/chunks", () => {
  it("returns an indexed page's chunks ordered by ord, each marked embedded", async () => {
    const pageId = await storePage("https://bg3.wiki/Fireball");
    await call(`/v1/kb/pages/${pageId}/index`, { method: "POST", headers: AUTH });

    const res = await call(`/v1/kb/pages/${pageId}/chunks`);
    expect(res.status).toBe(200);
    const body = await readJson<ChunkList>(res);
    expect(body.pageId).toBe(pageId);
    expect(body.chunks.length).toBeGreaterThan(0);

    const ords = body.chunks.map((c) => c.ord);
    expect(ords).toEqual([...ords].sort((a, b) => a - b));

    const first = body.chunks[0]!;
    expect(first.text.length).toBeGreaterThan(0);
    expect(first.tokenCount).toBeGreaterThan(0);
    expect(body.chunks.every((c) => c.hasEmbedding)).toBe(true);
  });

  it("returns an empty chunk list for a stored-but-unindexed page", async () => {
    const pageId = await storePage("https://bg3.wiki/MagicMissile");
    const body = await readJson<ChunkList>(await call(`/v1/kb/pages/${pageId}/chunks`));
    expect(body.pageId).toBe(pageId);
    expect(body.chunks).toEqual([]);
  });

  it("404s for an unknown page id", async () => {
    expect((await call("/v1/kb/pages/ghost/chunks")).status).toBe(404);
  });
});
