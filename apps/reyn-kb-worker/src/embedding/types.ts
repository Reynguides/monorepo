/**
 * Embedding provider seam. Turns text into dense vectors for similarity
 * search. The mock path produces deterministic unit vectors so tests can
 * assert exact ranking; the Workers-AI path calls the bge-base model.
 */

/** Embedding dimensionality for `@cf/baai/bge-base-en-v1.5`. */
export const EMBEDDING_DIM = 768;

export interface IEmbeddingProvider {
  /**
   * Embed a batch of texts. Returns one vector per input, in order, each of
   * length {@link EMBEDDING_DIM}.
   */
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** Errors raised by embedding providers surface a consistent shape. */
export class EmbeddingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "EmbeddingError";
  }
}
