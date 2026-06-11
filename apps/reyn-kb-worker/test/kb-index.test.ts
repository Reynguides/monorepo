import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl, getPageById } from "../src/repo/pages.ts";
import { listChunksByPageId } from "../src/repo/chunks.ts";
import { listSectionsByPage } from "../src/repo/sections.ts";
import { getEmbeddingStateByChunkIds } from "../src/repo/embedding-state.ts";
import { createVectorIndexClient, resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

const DOC = `<html><head><title>Fireball</title></head><body>
<h1>Fireball</h1><p>A wizard spell dealing fire damage in a 20-foot sphere.</p>
<h2>At Higher Levels</h2><p>Add 1d6 fire damage per spell slot above level 3.</p>
</body></html>`;

interface IndexResp {
  pageId: string;
  chunks: number;
  reindexed: boolean;
}

function storePage(html: string, url = "https://bg3.wiki/Fireball"): Promise<Response> {
  return call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: { sourceId: "s1", url, html, pageType: "spell" },
  });
}

function indexPage(id: string): Promise<Response> {
  return call(`/v1/kb/pages/${id}/index`, { method: "POST", headers: AUTH });
}

async function storedPageId(html: string, url?: string): Promise<string> {
  const body = await readJson<{ pageId: string }>(await storePage(html, url));
  return body.pageId;
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

describe("POST /v1/kb/pages/:id/index", () => {
  it("extracts, chunks, embeds, and populates vectors + FTS + ledger + sections", async () => {
    const pageId = await storedPageId(DOC);
    const body = await readJson<IndexResp>(await indexPage(pageId));
    expect(body.chunks).toBeGreaterThan(0);
    expect(body.reindexed).toBe(false);

    const chunks = await listChunksByPageId(env.KB_DB, pageId);
    expect(chunks.length).toBe(body.chunks);

    const ids = chunks.map((c) => c.id);
    const ledger = await getEmbeddingStateByChunkIds(env.KB_DB, ids);
    expect(ledger.length).toBe(chunks.length);

    const vec = createVectorIndexClient(env);
    const refs = await vec.getByIds(ids);
    expect(refs.length).toBe(chunks.length);
    expect(refs[0]!.metadata!.page_type).toBe("spell");

    const fts = await env.KB_DB.prepare(
      "SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?",
    )
      .bind("fire")
      .first<{ n: number }>();
    expect(fts!.n).toBeGreaterThan(0);

    const sections = await listSectionsByPage(env.KB_DB, pageId);
    expect(sections.map((s) => s.heading)).toContain("At Higher Levels");

    const page = await readJson<{ markdown: string }>(await call(`/v1/kb/pages/${pageId}`));
    expect(page.markdown).toContain("Fireball");
  });

  it("supersedes prior chunks + vectors on re-index, leaving no orphans", async () => {
    const pageId = await storedPageId(DOC); // 2 sections → 2 chunks
    await indexPage(pageId);
    const firstIds = (await listChunksByPageId(env.KB_DB, pageId)).map((c) => c.id);
    expect(firstIds.length).toBe(2);

    // Re-store with shorter content (1 chunk) + re-index.
    await storePage("<html><body><h1>X</h1><p>tiny content here</p></body></html>");
    const body = await readJson<IndexResp>(await indexPage(pageId));
    expect(body.reindexed).toBe(true);

    const newChunks = await listChunksByPageId(env.KB_DB, pageId);
    expect(newChunks.length).toBe(1);

    // The dropped chunk id must be gone from both the vector index and the ledger.
    const newIds = newChunks.map((c) => c.id);
    const staleIds = firstIds.filter((id) => !newIds.includes(id));
    expect(staleIds.length).toBeGreaterThan(0);
    const vec = createVectorIndexClient(env);
    expect(await vec.getByIds(staleIds)).toEqual([]);
    expect(await getEmbeddingStateByChunkIds(env.KB_DB, staleIds)).toEqual([]);
  });

  it("404s for an unknown page and 409s a page with no stored html", async () => {
    expect((await indexPage("ghost")).status).toBe(404);
    await upsertPageByUrl(env.KB_DB, {
      id: "p-nostore",
      sourceId: "s1",
      url: "https://bg3.wiki/NoStore",
      contentHash: "h",
      crawledAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect((await indexPage("p-nostore")).status).toBe(409);
  });

  it("handles a page with no extractable blocks (0 chunks, markdown still written)", async () => {
    const pageId = await storedPageId(
      "<html><body><div>loose text not in a block tag</div></body></html>",
      "https://bg3.wiki/Empty",
    );
    const body = await readJson<IndexResp>(await indexPage(pageId));
    expect(body.chunks).toBe(0);
    expect((await getPageById(env.KB_DB, pageId))!.r2_md_key).not.toBeNull();
  });
});
