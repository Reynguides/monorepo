/**
 * Pure evaluation metrics for the RAG evaluation harness.
 *
 * All functions are deterministic and side-effect-free. They are used by both
 * the coverage-gated unit tests (`test/eval-metrics.test.ts`) and the manual
 * evaluation CLI (`eval/run.ts`). The CLI is intentionally NOT coverage-gated;
 * the metrics themselves are, so quality regressions surface in CI without
 * needing a live worker.
 *
 * Conventions for empty-set cases are documented on each function. They are
 * explicit by design: silently returning 1 for empty-expected would mask
 * misconfigured golden sets.
 */

/**
 * Fraction of the expected source URLs that appear among the actual citation
 * URLs (string equality). Order is irrelevant; duplicates in either list are
 * treated as a single entry (membership test, not multiset).
 *
 * - `expectedUrls` empty → returns 1 (trivially satisfied).
 * - `expectedUrls` non-empty, `citationUrls` empty → returns 0 (nothing found).
 * - Result is always in [0, 1].
 */
export function retrievalHitRate(
  expectedUrls: readonly string[],
  citationUrls: readonly string[],
): number {
  if (expectedUrls.length === 0) {
    return 1;
  }
  const cited = new Set(citationUrls);
  const hits = expectedUrls.filter((u) => cited.has(u)).length;
  return hits / expectedUrls.length;
}

/**
 * Per-item citation precision and recall.
 *
 * - **precision**: fraction of cited URLs that are in `expectedUrls`. 0 citations
 *   → precision 0.
 * - **recall**: fraction of expected URLs that were cited. 0 expected → recall 1
 *   (trivially satisfied). Non-empty expected, 0 cited → recall 0.
 *
 * The asymmetry (precision=0 vs recall=1 when both are empty) reflects standard
 * information-retrieval convention.
 */
export function citationScores(
  expectedUrls: readonly string[],
  citationUrls: readonly string[],
): { precision: number; recall: number } {
  const expected = new Set(expectedUrls);
  const cited = new Set(citationUrls);

  if (cited.size === 0) {
    return { precision: 0, recall: expectedUrls.length === 0 ? 1 : 0 };
  }

  const relevant = [...cited].filter((u) => expected.has(u)).length;
  const precision = relevant / cited.size;
  const recall = expectedUrls.length === 0 ? 1 : relevant / expectedUrls.length;
  return { precision, recall };
}

/**
 * Cheap grounding proxy: returns `true` when the answer is non-empty AND at
 * least one citation was returned.
 *
 * This is NOT a true hallucination detector — it cannot tell whether the answer
 * text is actually supported by the cited sources. True grounding measurement
 * requires a live LLM judge. Use this proxy as a coarse guard only.
 */
export function groundedProxy(answer: string, citationCount: number): boolean {
  return answer.trim().length > 0 && citationCount > 0;
}

/** Per-item result shape consumed by `aggregate`. */
export interface EvalItem {
  hitRate: number;
  precision: number;
  recall: number;
  grounded: boolean;
  latencyMs: number;
}

/** Aggregate statistics across a run of eval items. */
export interface AggregateResult {
  meanHitRate: number;
  meanPrecision: number;
  meanRecall: number;
  groundedRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  n: number;
}

/**
 * Aggregate per-item eval results into summary statistics.
 *
 * - All `mean*` values are arithmetic means. Returns 0 for empty input.
 * - `groundedRate` is the fraction of items where `grounded === true`.
 * - `p50LatencyMs` and `p95LatencyMs` are the 50th/95th percentile latencies via
 *   nearest-rank on the sorted latency array.
 * - Empty input → all 0, n=0.
 */
export function aggregate(perItem: readonly EvalItem[]): AggregateResult {
  const n = perItem.length;
  if (n === 0) {
    return {
      meanHitRate: 0,
      meanPrecision: 0,
      meanRecall: 0,
      groundedRate: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      n: 0,
    };
  }

  const sum = (key: keyof Pick<EvalItem, "hitRate" | "precision" | "recall" | "latencyMs">) =>
    perItem.reduce((acc, it) => acc + it[key], 0);

  const meanHitRate = sum("hitRate") / n;
  const meanPrecision = sum("precision") / n;
  const meanRecall = sum("recall") / n;
  const groundedRate = perItem.filter((it) => it.grounded).length / n;

  const sorted = [...perItem.map((it) => it.latencyMs)].sort((a, b) => a - b);
  const p50LatencyMs = percentile(sorted, 50);
  const p95LatencyMs = percentile(sorted, 95);

  return { meanHitRate, meanPrecision, meanRecall, groundedRate, p50LatencyMs, p95LatencyMs, n };
}

/**
 * Nearest-rank percentile on a pre-sorted array. Returns 0 for an empty array.
 * `pct` is in [0, 100]. The nearest-rank formula is `ceil(pct/100 * n) - 1`
 * (0-indexed), clamped into [0, n-1].
 */
function percentile(sorted: readonly number[], pct: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}
