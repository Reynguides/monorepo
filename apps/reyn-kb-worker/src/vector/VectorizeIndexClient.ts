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
export interface VectorizeBinding {
  upsert(vectors: VectorRecord[]): Promise<unknown>;
  query(vector: number[], options: { topK: number }): Promise<{ matches?: VectorMatch[] }>;
  deleteByIds(ids: string[]): Promise<unknown>;
  getByIds(ids: string[]): Promise<VectorRef[]>;
}

/**
 * Real vector index client backed by the Cloudflare Vectorize binding.
 * Vectorize has no local emulator, so this is exercised in tests via an
 * injected stub binding.
 */
export class VectorizeIndexClient implements IVectorIndexClient {
  private readonly index: VectorizeBinding;

  constructor(index: VectorizeBinding) {
    this.index = index;
  }

  public async upsert(vectors: readonly VectorRecord[]): Promise<void> {
    await this.index.upsert([...vectors]);
  }

  public async query(vector: number[], opts: QueryOptions): Promise<VectorMatch[]> {
    const result = await this.index.query(vector, { topK: opts.topK });
    return result.matches ?? [];
  }

  public async deleteByIds(ids: readonly string[]): Promise<void> {
    await this.index.deleteByIds([...ids]);
  }

  public async getByIds(ids: readonly string[]): Promise<VectorRef[]> {
    return await this.index.getByIds([...ids]);
  }
}
