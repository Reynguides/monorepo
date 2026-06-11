/**
 * Answer-quality scoring for the RAG query pipeline.
 *
 * Three deterministic, side-effect-free signals derived from the retrieval
 * matches and the cited pages. Answer quality is summarised as top-K similarity
 * + coverage above a threshold, plus a recency (freshness) term so stale corpora
 * are visibly de-weighted. Every function returns a value in [0, 1] and is 0 for
 * empty input.
 */

/** Clamps `n` into the closed interval [0, 1]. */
function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Mean of the top-K match scores. The caller passes the (already top-K-truncated)
 * match scores, so this is their arithmetic mean. Returns 0 for an empty list.
 * Cosine scores are assumed in [0, 1]; the result is clamped defensively so the
 * contract holds even if a provider returns a slightly out-of-range score.
 */
export function relevanceScore(matchScores: readonly number[]): number {
  if (matchScores.length === 0) {
    return 0;
  }
  const sum = matchScores.reduce((acc, s) => acc + s, 0);
  return clamp01(sum / matchScores.length);
}

/**
 * Fraction of matches whose score meets or exceeds `threshold` — i.e. how much
 * of the retrieved set is confidently relevant (coverage). Returns 0 for an
 * empty list. Result is in [0, 1] by construction.
 */
export function confidenceScore(matchScores: readonly number[], threshold: number): number {
  if (matchScores.length === 0) {
    return 0;
  }
  const above = matchScores.filter((s) => s >= threshold).length;
  return above / matchScores.length;
}

/**
 * Recency of the cited pages as exponential decay on age. Uses the MOST-RECENT
 * crawl time (the freshest evidence backing the answer): age in days is decayed
 * with a half-life of `halfLifeDays` via `0.5 ** (ageDays / halfLifeDays)`, so a
 * just-crawled page scores ~1 and one `halfLifeDays` old scores ~0.5. `nowMs` is
 * injected to keep the function pure. Future timestamps (negative age) and any
 * rounding are clamped into [0, 1]. Returns 0 for an empty list.
 */
export function freshnessScore(
  crawledAtMs: readonly number[],
  nowMs: number,
  halfLifeDays: number,
): number {
  if (crawledAtMs.length === 0) {
    return 0;
  }
  const mostRecent = Math.max(...crawledAtMs);
  const ageMs = nowMs - mostRecent;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, ageDays / halfLifeDays);
  return clamp01(decay);
}
