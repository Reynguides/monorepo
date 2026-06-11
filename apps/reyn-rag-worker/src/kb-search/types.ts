import { z } from "zod";

/**
 * KB search client seam. Retrieval is owned by the KB worker; this consumer
 * calls its `POST /v1/kb/search` (the real client) or returns canned results
 * (the mock). The response is Zod-validated at the boundary (ADR-0009: no
 * double-cast) so a malformed payload fails loudly rather than corrupting the
 * pipeline.
 */

/** Errors raised by KB search clients surface a consistent shape. */
export class KbSearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "KbSearchError";
  }
}

/**
 * Structured filters forwarded verbatim to the KB worker's search API. Defined
 * as a Zod schema so the rag request boundary (schemas/rag.ts) can reuse it as
 * the single source of truth — avoids a duplicated shape drifting out of sync.
 */
export const KbSearchFiltersSchema = z.object({
  pageTypes: z.array(z.string().min(1).max(40)).optional(),
  tiersMax: z.number().int().min(1).optional(),
  language: z.string().min(2).max(10).optional(),
  lifecycle: z.string().min(1).max(20).optional(),
  freshnessAfter: z.number().int().nonnegative().optional(),
});

export type KbSearchFilters = z.infer<typeof KbSearchFiltersSchema>;

/** A retrieval request. `mode` defaults to "hybrid" at the client boundary. */
export interface KbSearchRequest {
  query: string;
  topK?: number;
  mode?: "hybrid" | "semantic" | "keyword";
  filters?: KbSearchFilters;
}

const KbSearchScoresSchema = z.object({
  semantic: z.number().nullable(),
  keyword: z.number().nullable(),
  fused: z.number(),
  tier: z.number(),
  freshness: z.number(),
});

/** One ranked chunk as returned by the KB worker's hybrid search (ADR-0023). */
export const KbSearchResultSchema = z.object({
  chunkId: z.string(),
  pageId: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  headingPath: z.string().nullable(),
  pageType: z.string(),
  sourceTier: z.number(),
  snippet: z.string(),
  scores: KbSearchScoresSchema,
  via: z.string(),
});

export type KbSearchResult = z.infer<typeof KbSearchResultSchema>;

/** The full `/v1/kb/search` response envelope. */
export const KbSearchResponseSchema = z.object({
  query: z.string(),
  mode: z.string(),
  results: z.array(KbSearchResultSchema),
});

export interface IKbSearchClient {
  search(req: KbSearchRequest): Promise<KbSearchResult[]>;
}
