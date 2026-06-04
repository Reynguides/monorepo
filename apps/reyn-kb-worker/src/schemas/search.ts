/** Zod request schema for the hybrid search API (ADR-0023). */
import { z } from "zod";
import { PAGE_TYPES } from "./kb.ts";

export const SearchFiltersSchema = z.object({
  pageTypes: z.array(z.enum(PAGE_TYPES)).optional(),
  tiersMax: z.number().int().min(1).optional(),
  language: z.string().min(2).max(10).optional(),
  lifecycle: z.string().min(1).max(20).optional(),
  freshnessAfter: z.number().int().nonnegative().optional(),
});

export const SearchRequest = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).default(10),
  mode: z.enum(["hybrid", "semantic", "keyword"]).default("hybrid"),
  filters: SearchFiltersSchema.optional(),
  expand: z.boolean().default(false),
  expandEdgeTypes: z.array(z.string().min(1).max(40)).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequest>;
