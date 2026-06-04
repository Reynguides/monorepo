import { EMBEDDING_DIM, type IEmbeddingProvider } from "./types.ts";

/**
 * Deterministic, dependency-free embedding provider for local dev + tests.
 *
 * Each text is hashed into a fixed-length vector via a seeded splitmix-style
 * PRNG, then L2-normalised to a unit vector. The same text always maps to the
 * same vector (stable across runs and isolates), so cosine-similarity ranking
 * is fully reproducible in tests. Distinct texts get distinct directions.
 */
export class MockEmbeddingProvider implements IEmbeddingProvider {
  public embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => embedOne(t)));
  }
}

function embedOne(text: string): number[] {
  let seed = hashString(text);
  const raw = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    seed = (seed + 0x9e3779b9) >>> 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z ^= z >>> 15;
    // Map to [-1, 1).
    raw[i] = ((z >>> 0) / 0xffffffff) * 2 - 1;
  }
  return normalise(raw);
}

function hashString(text: string): number {
  // FNV-1a 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function normalise(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  // The `|| 1` guards a zero-norm (all-zero) vector. The PRNG above always
  // yields non-zero components for any input (the FNV seed is non-zero), so
  // this fallback is unreachable via the public API — defensive only.
  /* istanbul ignore next -- @preserve unreachable: PRNG output is never all-zero */
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}
