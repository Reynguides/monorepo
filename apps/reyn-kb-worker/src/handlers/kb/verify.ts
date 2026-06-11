import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { BGE_BASE_MODEL } from "../../embedding/WorkersAiEmbeddingProvider.ts";
import { ftsIndexConsistent } from "../../repo/chunks.ts";
import {
  listChunkIdsLackingEmbedding,
  listNamespaceDriftChunkIds,
  listOrphanEmbeddingChunkIds,
} from "../../repo/embedding-state.ts";
import { listDanglingEdgeIds } from "../../repo/edges.ts";
import { countDanglingChunkImages } from "../../repo/images.ts";
import { listPagesWithValidationFailures } from "../../repo/rule-events.ts";

interface VerifyChecks {
  /** Chunks with no Vectorize embedding row (under-indexed). */
  chunksLackingEmbedding: number;
  /** Ledger rows whose chunk was deleted (stale vector left behind). */
  orphanEmbeddings: number;
  /** Ledger namespace no longer equal to the chunk's page type. */
  namespaceDrift: number;
  /** `page_edges` resolved to a now-missing page. */
  danglingEdges: number;
  /** `chunk_images` links pointing at a missing chunk or image. */
  danglingChunkImages: number;
  /** FTS5 index consistent with the chunks content table (integrity-check rank=1). */
  ftsConsistent: boolean;
  /** Pages with an unresolved validate-phase failure (content health, not integrity). */
  pagesWithValidationFailures: number;
}

interface VerifyReport {
  /** True when every structural-integrity drift class is zero. */
  ok: boolean;
  checks: VerifyChecks;
}

async function buildReport(db: D1Database): Promise<VerifyReport> {
  const [lacking, orphan, nsDrift, edges, chunkImages, validation, ftsConsistent] =
    await Promise.all([
      listChunkIdsLackingEmbedding(db, BGE_BASE_MODEL),
      listOrphanEmbeddingChunkIds(db),
      listNamespaceDriftChunkIds(db),
      listDanglingEdgeIds(db),
      countDanglingChunkImages(db),
      listPagesWithValidationFailures(db),
      ftsIndexConsistent(db),
    ]);
  const checks: VerifyChecks = {
    chunksLackingEmbedding: lacking.length,
    orphanEmbeddings: orphan.length,
    namespaceDrift: nsDrift.length,
    danglingEdges: edges.length,
    danglingChunkImages: chunkImages,
    ftsConsistent,
    pagesWithValidationFailures: validation.length,
  };
  // `ok` reflects structural integrity only; validation failures are a content-quality
  // signal (a page may legitimately fail validation and be skipped), surfaced separately.
  const driftCounts = [
    checks.chunksLackingEmbedding,
    checks.orphanEmbeddings,
    checks.namespaceDrift,
    checks.danglingEdges,
    checks.danglingChunkImages,
  ];
  const ok = driftCounts.every((n) => n === 0) && checks.ftsConsistent;
  return { ok, checks };
}

/**
 * GET /v1/kb/verify (OPEN). Cross-store reconciliation report (P8): D1 ↔ the
 * embedding ledger (Vectorize proxy) ↔ FTS5 ↔ the edge/image graph. Always 200 —
 * `ok:false` with non-zero counts is a report, not a server error.
 */
export const verifyHandler: Handler<{ Bindings: Env }> = async (c) => {
  return c.json(await buildReport(c.env.KB_DB), 200);
};
