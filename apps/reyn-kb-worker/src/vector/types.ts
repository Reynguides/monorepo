/**
 * Vector index seam. Stores chunk embeddings and serves topK similarity
 * queries. The mock path is an in-memory index with real cosine similarity so
 * ranking is testable; the vectorize path delegates to the Vectorize binding.
 * Each record carries an optional `namespace` (P5 sets it to the page_type) and
 * `metadata` (used for structured filtering at query time, P7).
 */

export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
  namespace?: string;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorRef {
  id: string;
  metadata?: Record<string, unknown>;
}

export interface QueryOptions {
  topK: number;
}

export interface IVectorIndexClient {
  upsert(vectors: readonly VectorRecord[]): Promise<void>;
  query(vector: number[], opts: QueryOptions): Promise<VectorMatch[]>;
  deleteByIds(ids: readonly string[]): Promise<void>;
  getByIds(ids: readonly string[]): Promise<VectorRef[]>;
}

/** Errors raised by vector index clients surface a consistent shape. */
export class VectorIndexError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "VectorIndexError";
  }
}
