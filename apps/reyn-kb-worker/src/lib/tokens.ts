/**
 * Token-count estimate. A tokenizer-free `chars / 4` proxy (ADR-0021): it only
 * bounds chunk size and feeds telemetry, and is retrieval-neutral for the
 * bge-base embedder (Workers AI truncates over-long inputs itself). Swap in a
 * real tokenizer later without touching callers.
 */
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
