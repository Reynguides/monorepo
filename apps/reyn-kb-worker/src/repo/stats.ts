/** Corpus-wide counts for the stats endpoint (P8). One round-trip via subselects. */

export interface CorpusStats {
  sources: number;
  pages: number;
  sections: number;
  chunks: number;
  images: number;
  edges: number;
  entities: number;
  embeddings: number;
  rules: number;
  ruleEvents: number;
  pagesByLifecycle: Record<string, number>;
}

interface TotalsRow {
  sources: number;
  pages: number;
  sections: number;
  chunks: number;
  images: number;
  edges: number;
  entities: number;
  embeddings: number;
  rules: number;
  ruleEvents: number;
}

export async function collectCorpusStats(db: D1Database): Promise<CorpusStats> {
  const totals = (await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM sources) AS sources,
         (SELECT count(*) FROM pages) AS pages,
         (SELECT count(*) FROM sections) AS sections,
         (SELECT count(*) FROM chunks) AS chunks,
         (SELECT count(*) FROM images) AS images,
         (SELECT count(*) FROM page_edges) AS edges,
         (SELECT count(*) FROM entities) AS entities,
         (SELECT count(*) FROM embedding_state) AS embeddings,
         (SELECT count(*) FROM rules) AS rules,
         (SELECT count(*) FROM rule_events) AS ruleEvents`,
    )
    .first<TotalsRow>())!;
  const life = await db
    .prepare("SELECT lifecycle, count(*) AS n FROM pages GROUP BY lifecycle")
    .all<{ lifecycle: string; n: number }>();
  const pagesByLifecycle: Record<string, number> = {};
  for (const r of life.results) pagesByLifecycle[r.lifecycle] = r.n;
  return { ...totals, pagesByLifecycle };
}
