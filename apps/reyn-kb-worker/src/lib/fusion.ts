/**
 * Reciprocal Rank Fusion (ADR-0023). Combines several ranked id-lists into one
 * score per id: `score(id) = Σ_lists 1 / (k + rank)` (rank 1-based). Robust to
 * the different score scales of cosine similarity vs BM25 — only ranks matter.
 * Pure + deterministic.
 */
export const RRF_K = 60;

export function reciprocalRankFusion(
  lists: readonly (readonly string[])[],
  k: number = RRF_K,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}
