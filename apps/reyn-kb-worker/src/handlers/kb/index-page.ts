import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { sha256Hex } from "../../lib/content-hash.ts";
import { getPageById, setPageMdKey, type PageRow } from "../../repo/pages.ts";
import { getSourceById } from "../../repo/sources.ts";
import {
  insertChunks,
  listChunksByPageId,
  deleteChunksByPageId,
  type ChunkInput,
} from "../../repo/chunks.ts";
import { replaceSectionsForPage } from "../../repo/sections.ts";
import {
  insertEmbeddingState,
  listVectorIdsByPageId,
  deleteEmbeddingStateByChunkIds,
} from "../../repo/embedding-state.ts";
import { createObjectStore } from "../../store/factory.ts";
import type { IObjectStore } from "../../store/types.ts";
import { createEmbeddingProvider } from "../../embedding/factory.ts";
import { BGE_BASE_MODEL } from "../../embedding/WorkersAiEmbeddingProvider.ts";
import { createVectorIndexClient } from "../../vector/factory.ts";
import type { IVectorIndexClient, VectorRecord } from "../../vector/types.ts";
import { extractContent, type ExtractedContent } from "../../lib/extract.ts";
import { chunkBlocks, type Chunk } from "../../lib/chunking.ts";
import { approxTokenCount } from "../../lib/tokens.ts";
import { logEvent } from "../../lib/log.ts";
import { buildPageRelationships } from "./build-relationships.ts";
import { getSource } from "../../lib/sources.ts";
import { cleanExtracted } from "../../lib/clean-content.ts";

const CHUNK_MAX_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

/** Cleaned markdown built from the extracted structure (served via GET page). */
function buildMarkdown(extracted: ExtractedContent): string {
  const parts: string[] = [];
  if (extracted.title !== null) parts.push(`# ${extracted.title}`);
  let lastPath: string | null = null;
  for (const b of extracted.blocks) {
    if (b.headingPath !== lastPath) {
      lastPath = b.headingPath;
      if (b.headingPath !== null) parts.push(`## ${b.headingPath}`);
    }
    parts.push(b.text);
  }
  return parts.join("\n\n");
}

/** Embed-text for a chunk: prefix the heading path to improve recall. */
function embedText(ch: Chunk): string {
  return ch.headingPath !== null ? `${ch.headingPath}\n${ch.text}` : ch.text;
}

async function toChunkInputs(pageId: string, chunks: readonly Chunk[]): Promise<ChunkInput[]> {
  return Promise.all(
    chunks.map(async (ch) => ({
      id: `${pageId}:${ch.ord}`,
      pageId,
      ord: ch.ord,
      headingPath: ch.headingPath,
      text: ch.text,
      contentHash: await sha256Hex(ch.text),
      tokenCount: approxTokenCount(ch.text),
    })),
  );
}

function buildVectorRecords(
  rows: readonly ChunkInput[],
  vectors: readonly number[][],
  page: PageRow,
  sourceTier: number,
): VectorRecord[] {
  return rows.map((row, i) => ({
    id: row.id,
    values: vectors[i]!,
    namespace: page.page_type,
    metadata: {
      page_id: page.id,
      chunk_id: row.id,
      url: page.url,
      source_id: page.source_id,
      source_tier: sourceTier,
      page_type: page.page_type,
      lifecycle: page.lifecycle,
      language: page.language,
      crawled_at: page.crawled_at,
      ...(row.headingPath !== null ? { heading_path: row.headingPath } : {}),
    },
  }));
}

/** Delete a page's existing chunks + their vectors + ledger rows (supersede). */
async function supersede(
  db: D1Database,
  vector: IVectorIndexClient,
  pageId: string,
): Promise<number> {
  const existing = await listChunksByPageId(db, pageId);
  if (existing.length === 0) return 0;
  const vectorIds = await listVectorIdsByPageId(db, pageId);
  if (vectorIds.length > 0) await vector.deleteByIds(vectorIds);
  await deleteEmbeddingStateByChunkIds(
    db,
    existing.map((c) => c.id),
  );
  await deleteChunksByPageId(db, pageId);
  return existing.length;
}

interface IndexInputs {
  page: PageRow;
  sourceTier: number;
  html: string;
}

/** Loads + validates everything the index needs, or returns an error Response. */
async function loadInputs(
  c: Parameters<Handler<{ Bindings: Env }>>[0],
  store: IObjectStore,
): Promise<IndexInputs | Response> {
  const db = c.env.KB_DB;
  const page = await getPageById(db, c.req.param("id")!);
  if (page === null) return fail(c, 404, "page_not_found");
  if (page.r2_raw_key === null) return fail(c, 409, "page_not_stored", "no raw HTML to index");
  const source = await getSourceById(db, page.source_id);
  if (source === null) return fail(c, 409, "source_missing");
  const html = await store.get(page.r2_raw_key);
  if (html === null) return fail(c, 409, "raw_html_missing");
  return { page, sourceTier: source.tier, html };
}

async function persistChunks(
  c: Parameters<Handler<{ Bindings: Env }>>[0],
  vector: IVectorIndexClient,
  inputs: IndexInputs,
  chunks: readonly Chunk[],
): Promise<void> {
  const db = c.env.KB_DB;
  const rows = await toChunkInputs(inputs.page.id, chunks);
  const embedding = createEmbeddingProvider(c.env);
  const vectors = await embedding.embed(chunks.map(embedText));
  if (vectors.length !== rows.length) {
    throw new Error(`embedding count mismatch: ${vectors.length} != ${rows.length}`);
  }
  await vector.upsert(buildVectorRecords(rows, vectors, inputs.page, inputs.sourceTier));
  await insertChunks(db, rows);
  await insertEmbeddingState(
    db,
    rows.map((r) => ({
      chunkId: r.id,
      model: BGE_BASE_MODEL,
      vectorId: r.id,
      namespace: inputs.page.page_type,
      indexedAt: Date.now(),
    })),
  );
}

/**
 * POST /v1/kb/pages/:id/index (ingest-key gated). Extracts the stored HTML,
 * sections + chunks it, embeds each chunk, upserts vectors (metadata + namespace),
 * stores cleaned markdown, and writes chunk + ledger rows (triggers populate the
 * FTS index). Supersede-on-change: existing chunks/vectors/ledger are deleted
 * first, so re-indexing leaves exactly the new set with no orphans (ADR-0022).
 */
export const indexPageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const store = createObjectStore(c.env);
  const inputs = await loadInputs(c, store);
  if (inputs instanceof Response) return inputs;
  const { page } = inputs;
  const db = c.env.KB_DB;

  const extracted = await extractContent(inputs.html);
  // Source-specific boilerplate removal (ADR-0018 seam): drops chunk-zero chrome
  // and trailing link-spam sections per the source's `clean` config. No-op for
  // sources without one. Feeds chunks, markdown, sections, and relationships.
  const cleaned = cleanExtracted(extracted, getSource(page.source_id)?.clean);
  const chunks = chunkBlocks(cleaned.blocks, {
    maxChars: CHUNK_MAX_CHARS,
    overlapChars: CHUNK_OVERLAP_CHARS,
  });

  const vector = createVectorIndexClient(c.env);
  const removed = await supersede(db, vector, page.id);

  const mdKey = `pages/${page.id}/clean.md`;
  await store.put(mdKey, buildMarkdown(cleaned), { contentType: "text/markdown; charset=utf-8" });
  await setPageMdKey(db, page.id, mdKey);
  await replaceSectionsForPage(
    db,
    page.id,
    cleaned.sections.map((s) => ({
      id: `${page.id}:sec:${s.ord}`,
      ord: s.ord,
      level: s.level,
      heading: s.heading,
      anchor: s.anchor,
      headingPath: s.headingPath,
    })),
  );

  if (chunks.length > 0) {
    await persistChunks(c, vector, inputs, chunks);
  }
  await buildPageRelationships(db, page, inputs.sourceTier, cleaned);
  logEvent("info", "kb.index", {
    pageId: page.id,
    chunks: chunks.length,
    sections: extracted.sections.length,
    reindexed: removed > 0,
  });
  return c.json({ pageId: page.id, chunks: chunks.length, reindexed: removed > 0 }, 200);
};
