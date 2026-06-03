/**
 * Tier-boost re-ranking for RAG retrieval.
 *
 * Vectorize ranks purely by cosine similarity. We additionally prefer more
 * authoritative sources: a source's `tier` (1 = most authoritative, larger =
 * less) is folded into the score IN CODE here — no Vectorize metadata filter is
 * used (the PoC keeps all ranking client-side). The adjusted score is
 *
 *     adjusted = cosineScore + tierBoost(tier)
 *
 * where `tierBoost` is a small additive bonus that is largest for tier 1 and
 * decays toward 0 as the tier number grows, and is 0 when the tier is unknown
 * (`null`/missing). The boost is deliberately small relative to the [0, 1]
 * cosine range so similarity still dominates and only acts as a tie-breaker /
 * gentle nudge between comparably-similar chunks.
 *
 *     tierBoost(t) = TIER_BOOST_WEIGHT / t   (t >= 1)
 *     tierBoost(null) = 0
 *
 * e.g. with weight 0.05: tier 1 → +0.05, tier 2 → +0.025, tier 5 → +0.01.
 *
 * Pure + deterministic. The sort is stable on the adjusted score (descending);
 * ties preserve the input (cosine) order.
 */

/** Maximum additive boost, granted to tier 1. Small vs the [0,1] cosine range. */
export const TIER_BOOST_WEIGHT = 0.05;

/** Additive score bonus for a source tier (1 = best). Unknown tier → 0. */
export function tierBoost(tier: number | null | undefined): number {
  if (tier === null || tier === undefined || tier < 1) {
    return 0;
  }
  return TIER_BOOST_WEIGHT / tier;
}

/** A retrieval match carrying its cosine score and source tier. */
export interface RerankInput {
  score: number;
  tier: number | null;
}

/**
 * Returns the input matches re-ordered by descending tier-adjusted score. Does
 * not mutate the input array. Stable: equal adjusted scores keep input order.
 */
export function rerankByTier<T extends RerankInput>(matches: readonly T[]): T[] {
  return matches
    .map((m, index) => ({ m, index, adjusted: m.score + tierBoost(m.tier) }))
    .sort((a, b) => b.adjusted - a.adjusted || a.index - b.index)
    .map((x) => x.m);
}
