import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { sha256Hex } from "../../lib/content-hash.ts";
import { cleanHtml } from "../../lib/html-clean.ts";
import { chunkText } from "../../lib/chunking.ts";
import type { IndexPageResponse } from "../../schemas/kb.ts";
import { getPageById, setPageMdKey } from "../../repo/pages.ts";
import { getSourceById } from "../../repo/sources.ts";
import {
  deleteChunksByPageId,
  insertChunks,
  listChunksByPageId,
  type NewChunk,
} from "../../repo/chunks.ts";
import {
  deleteEmbeddingStateByChunkIds,
  insertEmbeddingState,
  listVectorIdsByPageId,
  type NewEmbeddingState,
} from "../../repo/embedding-state.ts";
import { createObjectStore } from "../../store/factory.ts";
import { createEmbeddingProvider } from "../../embedding/factory.ts";
import { createVectorIndexClient } from "../../vector/factory.ts";
import type { IVectorIndexClient, VectorRecord } from "../../vector/types.ts";
import { BGE_BASE_MODEL } from "../../embedding/WorkersAiEmbeddingProvider.ts";
import type { Chunk } from "../../lib/chunking.ts";

/** Chunking parameters. Constants so the index + verify paths agree. */
const CHUNK_MAX_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

/** Embedding model recorded in the ledger; mirrors ADR-0012's bge-base choice. */
const INDEX_MODEL = BGE_BASE_MODEL;

/** R2 key for a page's cleaned markdown body. */
export function cleanMarkdownKey(pageId: string): string {
  return `pages/${pageId}/clean.md`;
}

/** Vectorize vector id for a page's chunk at position `ord` (stable per page). */
function vectorId(pageId: string, ord: number): string {
  return `${pageId}:${ord}`;
}

/** Rough token estimate: ~4 chars/token. An approximation, not a real tokenizer. */
function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Supersede step (ADR-0016): delete the page's existing vectors (via the
 * embedding_state ledger — Vectorize has no scan), chunks, and ledger rows.
 * Returns whether the page had any prior chunks (drives `reindexed`).
 */
async function supersede(
  db: D1Database,
  vector: IVectorIndexClient,
  pageId: string,
): Promise<boolean> {
  const oldVectorIds = await listVectorIdsByPageId(db, pageId);
  const oldChunkIds = (await listChunksByPageId(db, pageId)).map((ch) => ch.id);
  if (oldVectorIds.length > 0) {
    await vector.deleteByIds(oldVectorIds);
  }
  if (oldChunkIds.length > 0) {
    await deleteEmbeddingStateByChunkIds(db, oldChunkIds);
  }
  await deleteChunksByPageId(db, pageId);
  return oldChunkIds.length > 0;
}

interface BuiltRows {
  chunkRows: NewChunk[];
  ledgerRows: NewEmbeddingState[];
  vectorRecords: VectorRecord[];
}

/** Builds the chunk + ledger + vector rows for a page's chunk set, in lockstep. */
async function buildRows(
  pageId: string,
  url: string,
  sourceTier: number | null,
  pieces: readonly Chunk[],
  embeddings: readonly number[][],
  now: number,
): Promise<BuiltRows> {
  const chunkRows: NewChunk[] = [];
  const ledgerRows: NewEmbeddingState[] = [];
  const vectorRecords: VectorRecord[] = [];
  for (const piece of pieces) {
    const id = vectorId(pageId, piece.ord);
    chunkRows.push({
      id,
      pageId,
      ord: piece.ord,
      text: piece.text,
      contentHash: await sha256Hex(piece.text),
      // ~4 chars/token approximation (no real tokenizer in-worker).
      tokenCount: approxTokenCount(piece.text),
    });
    ledgerRows.push({ chunkId: id, model: INDEX_MODEL, vectorId: id, indexedAt: now });
    // The provider returns exactly one vector per input text (in order), so the
    // `?? []` is a defensive fallback the public API can't reach.
    /* istanbul ignore next -- @preserve unreachable: one embedding per chunk */
    const values = embeddings[piece.ord] ?? [];
    vectorRecords.push({
      id,
      values,
      metadata: { page_id: pageId, chunk_id: id, source_tier: sourceTier, url },
    });
  }
  return { chunkRows, ledgerRows, vectorRecords };
}

/**
 * POST /v1/kb/pages/:id/index (ingest-key gated). Extracts → chunks → embeds →
 * upserts vectors for a stored page, superseding any prior index (ADR-0016).
 *
 * Flow:
 *  1. Load the page (404) + its raw HTML from R2 (409 if the blob is missing).
 *  2. cleanHtml(raw) → write markdown to R2, set page.r2_md_key.
 *  3. Supersede: delete old vectors (by the embedding_state ledger), old chunks,
 *     and old ledger rows. This is a FULL rebuild every call — idempotent since
 *     identical input yields an identical chunk set. (The chunk-level "skip
 *     unchanged content_hash" optimisation is DEFERRED — see ADR-0016.)
 *  4. chunkText(text) → embed → upsert one vector per chunk → insert chunk +
 *     ledger rows. Empty input stores nothing and returns { chunks: 0 }.
 */
export const indexPageHandler: Handler<{ Bindings: Env }> = async (c) => {
  /* istanbul ignore next -- :id always matches when this handler runs; the ?? ""
     is a type-narrowing guard only (param() is typed string | undefined). */
  const id = c.req.param("id") ?? "";
  const page = await getPageById(c.env.KB_DB, id);
  if (page === null) {
    return fail(c, 404, "page_not_found");
  }
  if (page.r2_raw_key === null) {
    return fail(c, 409, "raw_html_missing", "page has no raw HTML key");
  }

  const store = createObjectStore(c.env);
  const raw = await store.get(page.r2_raw_key);
  if (raw === null) {
    return fail(c, 409, "raw_html_missing", "raw HTML object not found in R2");
  }

  // Determine source tier for vector metadata (used in retrieval scoring).
  const source = await getSourceById(c.env.KB_DB, page.source_id);
  const sourceTier = source?.tier ?? null;

  // Extract + persist cleaned markdown.
  const cleaned = cleanHtml(raw);
  const mdKey = cleanMarkdownKey(page.id);
  await store.put(mdKey, cleaned.markdown, { contentType: "text/markdown" });
  await setPageMdKey(c.env.KB_DB, page.id, mdKey, Date.now());

  // Supersede prior index. Full rebuild every call — idempotent since identical
  // input yields an identical chunk set. (The chunk-level "skip unchanged
  // content_hash" optimisation is DEFERRED; see ADR-0016.)
  const vector = createVectorIndexClient(c.env);
  const reindexed = await supersede(c.env.KB_DB, vector, page.id);

  const pieces = chunkText(cleaned.text, {
    maxChars: CHUNK_MAX_CHARS,
    overlapChars: CHUNK_OVERLAP_CHARS,
  });
  if (pieces.length === 0) {
    const empty: IndexPageResponse = { pageId: page.id, chunks: 0, reindexed };
    return c.json(empty, 200);
  }

  const embedding = createEmbeddingProvider(c.env);
  const embeddings = await embedding.embed(pieces.map((p) => p.text));
  const { chunkRows, ledgerRows, vectorRecords } = await buildRows(
    page.id,
    page.url,
    sourceTier,
    pieces,
    embeddings,
    Date.now(),
  );

  await vector.upsert(vectorRecords);
  await insertChunks(c.env.KB_DB, chunkRows);
  await insertEmbeddingState(c.env.KB_DB, ledgerRows);

  const body: IndexPageResponse = { pageId: page.id, chunks: pieces.length, reindexed };
  return c.json(body, 200);
};
