/**
 * Translates a search request's structured filters into a Vectorize metadata
 * filter (+ optional namespace) for the semantic arm, into a predicate for
 * post-filtering the keyword arm, and sanitizes the free-text query for FTS5.
 * Pure + deterministic.
 */
import type { MetadataFilter } from "../vector/types.ts";

export interface SearchFilters {
  pageTypes?: string[] | undefined;
  tiersMax?: number | undefined;
  language?: string | undefined;
  lifecycle?: string | undefined;
  freshnessAfter?: number | undefined;
}

/** A row's filterable fields (from the chunk's page + its source tier). */
export interface FilterableRow {
  pageType: string;
  sourceTier: number;
  language: string;
  lifecycle: string;
  crawledAt: number;
}

export interface VectorFilterSpec {
  filter?: MetadataFilter;
  namespace?: string;
}

/** Map each populated structured filter to its Vectorize metadata operator. */
function buildMetadataFilter(f: SearchFilters): MetadataFilter {
  const filter: MetadataFilter = {};
  if (f.pageTypes !== undefined && f.pageTypes.length > 0) filter.page_type = { $in: f.pageTypes };
  if (f.tiersMax !== undefined) filter.source_tier = { $lte: f.tiersMax };
  if (f.language !== undefined) filter.language = f.language;
  if (f.lifecycle !== undefined) filter.lifecycle = f.lifecycle;
  if (f.freshnessAfter !== undefined) filter.crawled_at = { $gte: f.freshnessAfter };
  return filter;
}

/** A single-pageType filter doubles as a namespace shortcut (ADR-0022). */
function namespaceFor(f: SearchFilters): string | undefined {
  return f.pageTypes?.length === 1 ? f.pageTypes[0] : undefined;
}

/** Build the Vectorize metadata filter (+ namespace) for the semantic arm. */
export function buildVectorFilter(f: SearchFilters | undefined): VectorFilterSpec {
  const spec: VectorFilterSpec = {};
  if (f === undefined) return spec;
  const filter = buildMetadataFilter(f);
  if (Object.keys(filter).length > 0) spec.filter = filter;
  const ns = namespaceFor(f);
  if (ns !== undefined) spec.namespace = ns;
  return spec;
}

/** Predicate applying the same filters in code (keyword arm + final guard). */
export function rowPasses(row: FilterableRow, f: SearchFilters | undefined): boolean {
  if (f === undefined) return true;
  const checks = [
    f.pageTypes === undefined || f.pageTypes.length === 0 || f.pageTypes.includes(row.pageType),
    f.tiersMax === undefined || row.sourceTier <= f.tiersMax,
    f.language === undefined || row.language === f.language,
    f.lifecycle === undefined || row.lifecycle === f.lifecycle,
    f.freshnessAfter === undefined || row.crawledAt >= f.freshnessAfter,
  ];
  return checks.every((ok) => ok);
}

/** Sanitize free text into a safe FTS5 MATCH query (alphanumeric terms, AND-ed). */
export function toFtsQuery(query: string): string {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g);
  return terms === null ? "" : terms.join(" ");
}
