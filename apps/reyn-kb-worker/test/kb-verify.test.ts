import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { insertChunks, listChunksByPageId } from "../src/repo/chunks.ts";
import { insertEmbeddingState } from "../src/repo/embedding-state.ts";
import { insertEdges } from "../src/repo/edges.ts";
import { linkChunkImage } from "../src/repo/images.ts";
import { insertRuleEvents } from "../src/repo/rule-events.ts";
import { BGE_BASE_MODEL } from "../src/embedding/WorkersAiEmbeddingProvider.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

const DOC = `<html><head><title>Fireball</title></head><body>
<h1>Fireball</h1><p>A wizard spell dealing fire damage in a sphere.</p>
<h2>At Higher Levels</h2><p>Add 1d6 fire damage per slot above level 3.</p>
</body></html>`;

interface VerifyReport {
  ok: boolean;
  checks: {
    chunksLackingEmbedding: number;
    orphanEmbeddings: number;
    namespaceDrift: number;
    danglingEdges: number;
    danglingChunkImages: number;
    ftsConsistent: boolean;
    pagesWithValidationFailures: number;
  };
}

function verify(): Promise<Response> {
  return call("/v1/kb/verify");
}

let pageId = "";

beforeEach(async () => {
  resetMockVectorIndexClient();
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
  const stored = await readJson<{ pageId: string }>(
    await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId: "s1", url: "https://bg3.wiki/Fireball", html: DOC, pageType: "spell" },
    }),
  );
  pageId = stored.pageId;
  await call(`/v1/kb/pages/${pageId}/index`, { method: "POST", headers: AUTH });
});

describe("GET /v1/kb/verify", () => {
  it("reports ok with zero drift for a cleanly indexed corpus", async () => {
    const r = await readJson<VerifyReport>(await verify());
    expect(r.ok).toBe(true);
    expect(r.checks.chunksLackingEmbedding).toBe(0);
    expect(r.checks.orphanEmbeddings).toBe(0);
    expect(r.checks.namespaceDrift).toBe(0);
    expect(r.checks.ftsConsistent).toBe(true);
  });

  it("detects a chunk lacking an embedding", async () => {
    await insertChunks(env.KB_DB, [
      { id: "orphan-chunk", pageId, ord: 99, text: "x", contentHash: "h", tokenCount: 1 },
    ]);
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.chunksLackingEmbedding).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it("detects an orphan embedding (ledger row with no chunk)", async () => {
    await insertEmbeddingState(env.KB_DB, [
      { chunkId: "ghost", model: BGE_BASE_MODEL, vectorId: "v", namespace: "spell", indexedAt: 1 },
    ]);
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.orphanEmbeddings).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it("detects namespace drift between the ledger and the page type", async () => {
    const [chunk] = await listChunksByPageId(env.KB_DB, pageId);
    await insertEmbeddingState(env.KB_DB, [
      {
        chunkId: chunk!.id,
        model: BGE_BASE_MODEL,
        vectorId: "v",
        namespace: "wrong",
        indexedAt: 1,
      },
    ]);
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.namespaceDrift).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it("detects a dangling edge", async () => {
    await insertEdges(env.KB_DB, [
      { id: "dang", srcPageId: pageId, dstPageId: "no-such-page", edgeType: "link", createdAt: 1 },
    ]);
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.danglingEdges).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it("detects a dangling chunk_image link", async () => {
    await linkChunkImage(env.KB_DB, "no-chunk", "no-image");
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.danglingChunkImages).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it("detects FTS5 drift (index entry removed while the chunk remains)", async () => {
    // Drop one chunk's FTS index entry via the external-content 'delete' command,
    // leaving the chunk row in place → the index no longer matches the content table.
    const row = await env.KB_DB.prepare(
      "SELECT rowid AS rid, text, heading_path AS hp FROM chunks LIMIT 1",
    ).first<{ rid: number; text: string; hp: string | null }>();
    await env.KB_DB.prepare(
      "INSERT INTO chunks_fts(chunks_fts, rowid, text, heading_path) VALUES('delete', ?, ?, ?)",
    )
      .bind(row!.rid, row!.text, row!.hp)
      .run();
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.ftsConsistent).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("surfaces validation failures without flagging an integrity violation", async () => {
    await insertRuleEvents(env.KB_DB, [
      { id: "re1", pageId, ruleId: "r1", phase: "validate", outcome: "fail", createdAt: 1 },
    ]);
    const r = await readJson<VerifyReport>(await verify());
    expect(r.checks.pagesWithValidationFailures).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});
