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

/** A single metadata filter condition (mirrors the Vectorize operators we use). */
export type FilterCondition =
  | string
  | number
  | { $in: readonly string[] }
  | { $lte: number }
  | { $gte: number };

/** Field → condition map applied to vector metadata at query time. */
export type MetadataFilter = Record<string, FilterCondition>;

export interface QueryOptions {
  topK: number;
  /** Structured metadata filter (page_type, source_tier, lifecycle, …). */
  filter?: MetadataFilter;
  /** Namespace partition to restrict the search to (P5 sets namespace=page_type). */
  namespace?: string;
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
