import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { SearchRequest } from "../../schemas/search.ts";
import { createEmbeddingProvider } from "../../embedding/factory.ts";
import { createVectorIndexClient } from "../../vector/factory.ts";
import type { VectorMatch } from "../../vector/types.ts";
import {
  getChunksByIds,
  listChunksByPageId,
  searchChunksFts,
  type ChunkRow,
} from "../../repo/chunks.ts";
import { getPageById, getPagesByIds, type PageRow } from "../../repo/pages.ts";
import { listSources } from "../../repo/sources.ts";
import { listEdgesBySrcPage } from "../../repo/edges.ts";
import { reciprocalRankFusion } from "../../lib/fusion.ts";
import { freshnessScore, tierBoost } from "../../lib/scoring.ts";
import {
  buildVectorFilter,
  rowPasses,
  toFtsQuery,
  type FilterableRow,
  type SearchFilters,
  type VectorFilterSpec,
} from "../../lib/search-filters.ts";

const CANDIDATE_FACTOR = 3;
const FRESHNESS_HALF_LIFE_DAYS = 90;
const DEFAULT_EXPAND_EDGES = ["prerequisite", "see_also", "part_of"];

interface SearchScores {
  semantic: number | null;
  keyword: number | null;
  fused: number;
  tier: number;
  freshness: number;
}

interface SearchResult {
  chunkId: string;
  pageId: string;
  url: string;
  title: string | null;
  headingPath: string | null;
  pageType: string;
  sourceTier: number;
  snippet: string;
  scores: SearchScores;
  via: "primary" | "relationship";
}

type SearchReq = ReturnType<typeof SearchRequest.parse>;

function snippetOf(text: string): string {
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function toResult(
  chunk: ChunkRow,
  page: PageRow,
  tier: number,
  scores: SearchScores,
  via: "primary" | "relationship",
): SearchResult {
  return {
    chunkId: chunk.id,
    pageId: page.id,
    url: page.url,
    title: page.title,
    headingPath: chunk.heading_path,
    pageType: page.page_type,
    sourceTier: tier,
    snippet: snippetOf(chunk.text),
    scores,
    via,
  };
}

async function sourceTierMap(db: D1Database): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const s of await listSources(db)) map.set(s.id, s.tier);
  return map;
}

async function semanticArm(
  env: Env,
  query: string,
  candidateN: number,
  vspec: VectorFilterSpec,
): Promise<VectorMatch[]> {
  const [queryVector] = await createEmbeddingProvider(env).embed([query]);
  if (queryVector === undefined) return [];
  return createVectorIndexClient(env).query(queryVector, {
    topK: candidateN,
    ...(vspec.filter !== undefined ? { filter: vspec.filter } : {}),
    ...(vspec.namespace !== undefined ? { namespace: vspec.namespace } : {}),
  });
}

interface HydrationContext {
  pageMap: Map<string, PageRow>;
  tiers: Map<string, number>;
  now: number;
}

function buildPrimary(
  chunkRows: readonly ChunkRow[],
  ctx: HydrationContext,
  fused: Map<string, number>,
  semScore: Map<string, number>,
  kwScore: Map<string, number>,
  filters: SearchFilters | undefined,
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const chunk of chunkRows) {
    const page = ctx.pageMap.get(chunk.page_id);
    if (page === undefined) continue;
    const tier = ctx.tiers.get(page.source_id) ?? 0;
    const row: FilterableRow = {
      pageType: page.page_type,
      sourceTier: tier,
      language: page.language,
      lifecycle: page.lifecycle,
      crawledAt: page.crawled_at,
    };
    if (!rowPasses(row, filters)) continue;
    const scores: SearchScores = {
      semantic: semScore.get(chunk.id) ?? null,
      keyword: kwScore.get(chunk.id) ?? null,
      fused: fused.get(chunk.id) ?? 0,
      tier: tierBoost(tier),
      freshness: freshnessScore(page.crawled_at, ctx.now, FRESHNESS_HALF_LIFE_DAYS),
    };
    out.push(toResult(chunk, page, tier, scores, "primary"));
  }
  return out;
}

async function expandFromPage(
  db: D1Database,
  dstPageId: string,
  ctx: HydrationContext,
): Promise<SearchResult | null> {
  const [chunk] = await listChunksByPageId(db, dstPageId);
  const page = await getPageById(db, dstPageId);
  if (chunk === undefined || page === null) return null;
  const tier = ctx.tiers.get(page.source_id) ?? 0;
  return toResult(
    chunk,
    page,
    tier,
    {
      semantic: null,
      keyword: null,
      fused: 0,
      tier: tierBoost(tier),
      freshness: freshnessScore(page.crawled_at, ctx.now, FRESHNESS_HALF_LIFE_DAYS),
    },
    "relationship",
  );
}

async function expandRelationships(
  db: D1Database,
  primary: readonly SearchResult[],
  ctx: HydrationContext,
  edgeTypes: readonly string[],
): Promise<SearchResult[]> {
  const seen = new Set(primary.map((r) => r.pageId));
  const out: SearchResult[] = [];
  for (const r of primary) {
    for (const e of await listEdgesBySrcPage(db, r.pageId)) {
      if (e.dst_page_id === null || !edgeTypes.includes(e.edge_type) || seen.has(e.dst_page_id)) {
        continue;
      }
      seen.add(e.dst_page_id);
      const result = await expandFromPage(db, e.dst_page_id, ctx);
      if (result !== null) out.push(result);
    }
  }
  return out;
}

async function runSearch(env: Env, req: SearchReq): Promise<SearchResult[]> {
  const db = env.KB_DB;
  const candidateN = req.topK * CANDIDATE_FACTOR;
  const vspec = buildVectorFilter(req.filters);
  const semMatches =
    req.mode !== "keyword" ? await semanticArm(env, req.query, candidateN, vspec) : [];
  const kwHits =
    req.mode !== "semantic" ? await searchChunksFts(db, toFtsQuery(req.query), candidateN) : [];

  const fused = reciprocalRankFusion([semMatches.map((m) => m.id), kwHits.map((h) => h.id)]);
  if (fused.size === 0) return [];
  const semScore = new Map(semMatches.map((m) => [m.id, m.score]));
  const kwScore = new Map(kwHits.map((h) => [h.id, h.score]));

  const chunkRows = await getChunksByIds(db, [...fused.keys()]);
  const ctx: HydrationContext = {
    pageMap: await getPagesByIds(db, [...new Set(chunkRows.map((c) => c.page_id))]),
    tiers: await sourceTierMap(db),
    now: Date.now(),
  };
  const primary = buildPrimary(chunkRows, ctx, fused, semScore, kwScore, req.filters);
  primary.sort((a, b) => b.scores.fused + b.scores.tier - (a.scores.fused + a.scores.tier));
  const top = primary.slice(0, req.topK);
  if (!req.expand) return top;
  const expanded = await expandRelationships(
    db,
    top,
    ctx,
    req.expandEdgeTypes ?? DEFAULT_EXPAND_EDGES,
  );
  return [...top, ...expanded];
}

/**
 * POST /v1/kb/search (OPEN). Hybrid retrieval (ADR-0023): semantic (Vectorize,
 * metadata-filtered + namespaced) + keyword (D1 FTS5 BM25), fused via RRF, re-ranked
 * by source tier + freshness, optionally expanded along relationship edges. Returns
 * ranked chunks with all sub-scores — NO LLM answer (a future consumer's job).
 */
export const searchHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = SearchRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const results = await runSearch(c.env, parsed.data);
  return c.json({ query: parsed.data.query, mode: parsed.data.mode, results }, 200);
};
