import type {
  IVectorIndexClient,
  QueryOptions,
  VectorMatch,
  VectorRecord,
  VectorRef,
} from "./types.ts";

/**
 * In-memory vector index for local dev + tests. `query` performs real cosine
 * similarity over the stored vectors and returns the top-K by descending
 * score, so ranking assertions are meaningful without a live Vectorize index.
 */
export class MockVectorIndexClient implements IVectorIndexClient {
  private readonly store = new Map<string, VectorRecord>();

  public upsert(vectors: readonly VectorRecord[]): Promise<void> {
    for (const v of vectors) {
      this.store.set(v.id, {
        id: v.id,
        values: [...v.values],
        ...metaOf(v),
        ...(v.namespace !== undefined ? { namespace: v.namespace } : {}),
      });
    }
    return Promise.resolve();
  }

  public query(vector: number[], opts: QueryOptions): Promise<VectorMatch[]> {
    const scored: VectorMatch[] = [];
    for (const rec of this.store.values()) {
      scored.push({ id: rec.id, score: cosine(vector, rec.values), ...metaOf(rec) });
    }
    scored.sort((a, b) => b.score - a.score);
    return Promise.resolve(scored.slice(0, opts.topK));
  }

  public deleteByIds(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      this.store.delete(id);
    }
    return Promise.resolve();
  }

  public getByIds(ids: readonly string[]): Promise<VectorRef[]> {
    const out: VectorRef[] = [];
    for (const id of ids) {
      const rec = this.store.get(id);
      if (rec !== undefined) {
        out.push({ id: rec.id, ...metaOf(rec) });
      }
    }
    return Promise.resolve(out);
  }
}

function metaOf(v: { metadata?: Record<string, unknown> }): { metadata?: Record<string, unknown> } {
  return v.metadata !== undefined ? { metadata: v.metadata } : {};
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (const [i, av] of a.slice(0, len).entries()) {
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
