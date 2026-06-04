/**
 * Conflict-phase resolution: when multiple sources assert different values for the
 * same fact, prefer the most authoritative source (lowest `sourceTier`). A tie at
 * the top tier with differing values is reported as `unresolved` (surfaced by the
 * verify endpoint, P8) rather than silently picking one. Pure + deterministic.
 */

export interface Assertion<T> {
  value: T;
  sourceTier: number;
  pageId: string;
}

export interface ConflictResolution<T> {
  winner: Assertion<T> | null;
  losers: Assertion<T>[];
  unresolved: boolean;
}

export function resolveByTier<T>(assertions: readonly Assertion<T>[]): ConflictResolution<T> {
  if (assertions.length === 0) {
    return { winner: null, losers: [], unresolved: false };
  }
  const minTier = Math.min(...assertions.map((a) => a.sourceTier));
  const topTier = assertions.filter((a) => a.sourceTier === minTier);
  const distinctTopValues = new Set(topTier.map((a) => JSON.stringify(a.value)));
  const unresolved = distinctTopValues.size > 1;
  const winner = unresolved ? null : topTier[0]!;
  const losers = assertions.filter((a) => a !== winner);
  return { winner, losers, unresolved };
}
