import type {
  IVectorIndexClient,
  QueryOptions,
  VectorMatch,
  VectorRecord,
  VectorRef,
} from "./types.ts";

/**
 * Minimal structural view of the Vectorize binding we depend on. Defined
 * locally (rather than coupling to the exact generated `VectorizeIndex` type,
 * which varies across workers-types versions) so the adapter is trivially
 * unit-testable with a stub. The production binding (`env.VECTORIZE`) is
 * structurally compatible.
 */
export interface VectorizeQueryOptions {
  topK: number;
  returnMetadata?: string;
  filter?: Record<string, unknown>;
  namespace?: string;
}

export interface VectorizeBinding {
  upsert(vectors: VectorRecord[]): Promise<unknown>;
  query(vector: number[], options: VectorizeQueryOptions): Promise<{ matches?: VectorMatch[] }>;
  deleteByIds(ids: string[]): Promise<unknown>;
  getByIds(ids: string[]): Promise<VectorRef[]>;
}

/**
 * Real vector index client backed by the Cloudflare Vectorize binding.
 * Vectorize has no local emulator, so this is exercised in tests via an
 * injected stub binding.
 */
/** Vectorize caps vectors per upsert call; sub-batch so very large pages don't 500. */
export const UPSERT_MAX_BATCH = 1000;

/**
 * Vectorize caps the id-list payload of deleteByIds / getByIds at 100 ids per
 * call (error 40007 "too many ids in payload; max id count is 100"). A dense
 * page backs far more than 100 chunk vectors, so both id-list ops sub-batch —
 * without it, superseding a >100-chunk page on re-index 500s.
 */
export const ID_LIST_MAX_BATCH = 100;

export class VectorizeIndexClient implements IVectorIndexClient {
  private readonly index: VectorizeBinding;

  constructor(index: VectorizeBinding) {
    this.index = index;
  }

  public async upsert(vectors: readonly VectorRecord[]): Promise<void> {
    for (let start = 0; start < vectors.length; start += UPSERT_MAX_BATCH) {
      await this.index.upsert(vectors.slice(start, start + UPSERT_MAX_BATCH));
    }
  }

  public async query(vector: number[], opts: QueryOptions): Promise<VectorMatch[]> {
    const result = await this.index.query(vector, {
      topK: opts.topK,
      returnMetadata: "all",
      ...(opts.filter !== undefined ? { filter: opts.filter } : {}),
      ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    });
    return result.matches ?? [];
  }

  public async deleteByIds(ids: readonly string[]): Promise<void> {
    for (let start = 0; start < ids.length; start += ID_LIST_MAX_BATCH) {
      await this.index.deleteByIds(ids.slice(start, start + ID_LIST_MAX_BATCH));
    }
  }

  public async getByIds(ids: readonly string[]): Promise<VectorRef[]> {
    const out: VectorRef[] = [];
    for (let start = 0; start < ids.length; start += ID_LIST_MAX_BATCH) {
      out.push(...(await this.index.getByIds(ids.slice(start, start + ID_LIST_MAX_BATCH))));
    }
    return out;
  }
}
