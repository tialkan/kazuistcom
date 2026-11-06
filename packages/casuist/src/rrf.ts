/** Reciprocal rank fusion constant (plan 7.2/4). */
export const RRF_K = 60;

/**
 * Reciprocal rank fusion: score(d) = sum over lists of 1 / (k + rank), rank starting at 1.
 * Ties keep the order of first appearance, so the result is deterministic.
 */
export function rrf(lists: readonly (readonly string[])[], k: number = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}

/** Ids sorted by fused score, descending; ties by first appearance. */
export function fuse(
  lists: readonly (readonly string[])[],
  k: number = RRF_K,
): { id: string; score: number }[] {
  const scores = rrf(lists, k);
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

/** Best possible fused score for n lists (rank 1 everywhere), used to scale relevance into 0..1. */
export const maxRrf = (n: number, k: number = RRF_K): number => n / (k + 1);
