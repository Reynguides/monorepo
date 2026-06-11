import type {
  IVectorIndexClient,
  QueryOptions,
  VectorMatch,
  VectorRecord,
  VectorRef,
} from "./types.ts";

/**
 * A vector index that discards everything. For local/demo fills where semantic
 * search is not exercised: indexing still writes chunks + the embedding ledger to
 * D1, so browse, keyword (FTS) search, per-chunk `hasEmbedding`, and `verify` all
 * stay correct — but no vectors are held in memory, so a corpus of any size indexes
 * without the in-memory mock's ~18k-vector OOM. `query`/`getByIds` therefore return
 * nothing (only true semantic search depends on the vectors, and it is unused here).
 */
export class NoopVectorIndexClient implements IVectorIndexClient {
  public upsert(_vectors: readonly VectorRecord[]): Promise<void> {
    return Promise.resolve();
  }

  public query(_vector: number[], _opts: QueryOptions): Promise<VectorMatch[]> {
    return Promise.resolve([]);
  }

  public deleteByIds(_ids: readonly string[]): Promise<void> {
    return Promise.resolve();
  }

  public getByIds(_ids: readonly string[]): Promise<VectorRef[]> {
    return Promise.resolve([]);
  }
}
