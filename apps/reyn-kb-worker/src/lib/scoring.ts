/**
 * Post-fusion re-rank signals (pure, deterministic, in [0, 1] or small additive).
 * `tierBoost` nudges more-authoritative sources up; `freshnessScore` decays with
 * crawl age so stale pages are de-weighted.
 */

/** Additive boost for an authoritative source (tier 1 → +0.05, tier 2 → +0.025, …). */
export function tierBoost(tier: number | null): number {
  if (tier === null || tier < 1) return 0;
  return 0.05 / tier;
}

/**
 * Exponential recency decay: just-crawled ≈ 1, `halfLifeDays` old ≈ 0.5. `ageDays`
 * is floored at 0 (a future crawl time → 1, no above-1 boost), so the result is
 * always in (0, 1] — no further clamping needed.
 */
export function freshnessScore(crawledAtMs: number, nowMs: number, halfLifeDays: number): number {
  const ageDays = Math.max(0, (nowMs - crawledAtMs) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}
