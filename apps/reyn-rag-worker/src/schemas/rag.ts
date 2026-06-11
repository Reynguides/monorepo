import { z } from "zod";
import { KbSearchFiltersSchema } from "../kb-search/types.ts";

/** Validated at the read boundary with `safeParse`; failures → 400 validation_failed. */

export const RagQueryRequest = z.object({
  question: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(20).optional(),
  // Retrieval filters are the KB search filters (single source of truth).
  filters: KbSearchFiltersSchema.optional(),
});

export type RagQueryRequest = z.infer<typeof RagQueryRequest>;

/** A source the answer drew on, in re-ranked order, deduped by chunk id. */
export const RagCitation = z.object({
  url: z.string(),
  sourceTier: z.number().nullable(),
  chunkId: z.string(),
});

export type RagCitation = z.infer<typeof RagCitation>;

/** Answer-quality signals, each in [0, 1] (see lib/scoring.ts). */
export const RagScores = z.object({
  relevance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
});

export type RagScores = z.infer<typeof RagScores>;

export const RagQueryResponse = z.object({
  answer: z.string(),
  citations: z.array(RagCitation),
  scores: RagScores,
});

export type RagQueryResponse = z.infer<typeof RagQueryResponse>;
