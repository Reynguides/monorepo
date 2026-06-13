import { describe, expect, it, beforeEach } from "vitest";
import { MockVectorIndexClient } from "../src/vector/MockVectorIndexClient.ts";
import {
  VectorizeIndexClient,
  type VectorizeBinding,
  type VectorizeQueryOptions,
} from "../src/vector/VectorizeIndexClient.ts";
import { createVectorIndexClient, resetMockVectorIndexClient } from "../src/vector/factory.ts";
import { NoopVectorIndexClient } from "../src/vector/NoopVectorIndexClient.ts";
import { VectorIndexError, type MetadataFilter, type VectorRecord } from "../src/vector/types.ts";
import type { Env } from "../src/types/env.ts";

function asVectorize(x: unknown): VectorizeIndex {
  return x as VectorizeIndex;
}

function baseEnv(over: Partial<Env>): Env {
  return {
    KB_DB: {} as D1Database,
    EMBEDDING_PROVIDER: "mock",
    VECTOR_INDEX: "mock",
    OBJECT_STORE: "mock",
    ...over,
  };
}

describe("MockVectorIndexClient", () => {
  it("ranks by cosine similarity and returns topK with metadata", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "a", values: [1, 0], metadata: { t: 1 }, namespace: "spell" },
      { id: "b", values: [0, 1] },
      { id: "c", values: [0.9, 0.1] },
    ]);
    const matches = await c.query([1, 0], { topK: 2 });
    expect(matches.map((m) => m.id)).toEqual(["a", "c"]);
    expect(matches[0]!.metadata).toEqual({ t: 1 });
  });

  it("getByIds preserves order + skips missing; deleteByIds removes", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "a", values: [1] },
      { id: "b", values: [1] },
    ]);
    expect((await c.getByIds(["b", "x", "a"])).map((r) => r.id)).toEqual(["b", "a"]);
    await c.deleteByIds(["a"]);
    expect((await c.getByIds(["a", "b"])).map((r) => r.id)).toEqual(["b"]);
  });

  it("honours metadata filters ($in / $lte / $gte / equality) at query time", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      {
        id: "spell-old",
        values: [1, 0],
        metadata: { page_type: "spell", source_tier: 2, crawled_at: 100 },
      },
      {
        id: "spell-new",
        values: [0.99, 0.01],
        metadata: { page_type: "spell", source_tier: 1, crawled_at: 500 },
      },
      {
        id: "item-new",
        values: [0.98, 0.02],
        metadata: { page_type: "item", source_tier: 1, crawled_at: 500 },
      },
    ]);
    const ids = async (filter: MetadataFilter): Promise<string[]> =>
      (await c.query([1, 0], { topK: 10, filter })).map((m) => m.id).sort();

    expect(await ids({ page_type: { $in: ["spell"] } })).toEqual(["spell-new", "spell-old"]);
    expect(await ids({ source_tier: { $lte: 1 } })).toEqual(["item-new", "spell-new"]);
    expect(await ids({ crawled_at: { $gte: 300 } })).toEqual(["item-new", "spell-new"]);
    expect(await ids({ page_type: "item" })).toEqual(["item-new"]);
  });

  it("excludes records whose metadata is missing or the wrong type for the operator", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "bad-in", values: [1], metadata: { page_type: 7 } },
      { id: "bad-lte", values: [1], metadata: { source_tier: "x" } },
      { id: "no-meta", values: [1] },
    ]);
    expect(await c.query([1], { topK: 5, filter: { page_type: { $in: ["spell"] } } })).toEqual([]);
    expect(await c.query([1], { topK: 5, filter: { source_tier: { $lte: 1 } } })).toEqual([]);
    expect(await c.query([1], { topK: 5, filter: { crawled_at: { $gte: 1 } } })).toEqual([]);
  });

  it("restricts the search to a namespace partition", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "s1", values: [1, 0], namespace: "spell" },
      { id: "i1", values: [1, 0], namespace: "item" },
    ]);
    expect((await c.query([1, 0], { topK: 10, namespace: "item" })).map((m) => m.id)).toEqual([
      "i1",
    ]);
  });
});

describe("NoopVectorIndexClient (discard)", () => {
  it("discards upserts and returns no matches or refs", async () => {
    const c = new NoopVectorIndexClient();
    await c.upsert([
      { id: "a", values: [1, 0], metadata: { page_type: "spell" }, namespace: "spell" },
      { id: "b", values: [0, 1] },
    ]);
    expect(await c.query([1, 0], { topK: 10 })).toEqual([]);
    expect(await c.getByIds(["a", "b"])).toEqual([]);
    await expect(c.deleteByIds(["a"])).resolves.toBeUndefined();
  });
});

describe("VectorizeIndexClient (injected stub binding)", () => {
  it("delegates upsert / query / deleteByIds / getByIds", async () => {
    const upserts: VectorRecord[][] = [];
    const binding: VectorizeBinding = {
      upsert: (v) => {
        upserts.push(v);
        return Promise.resolve({});
      },
      query: () => Promise.resolve({ matches: [{ id: "a", score: 0.9 }] }),
      deleteByIds: () => Promise.resolve({}),
      getByIds: (ids) => Promise.resolve(ids.map((id) => ({ id }))),
    };
    const c = new VectorizeIndexClient(binding);
    await c.upsert([{ id: "a", values: [1] }]);
    expect(upserts[0]![0]!.id).toBe("a");
    expect((await c.query([1], { topK: 5 }))[0]!.id).toBe("a");
    await c.deleteByIds(["a"]);
    expect((await c.getByIds(["a"]))[0]!.id).toBe("a");
  });

  it("batches upsert into <=1000-vector calls for very large pages", async () => {
    const sizes: number[] = [];
    const binding: VectorizeBinding = {
      upsert: (v) => {
        sizes.push(v.length);
        return Promise.resolve({});
      },
      query: () => Promise.resolve({ matches: [] }),
      deleteByIds: () => Promise.resolve({}),
      getByIds: () => Promise.resolve([]),
    };
    const vecs = Array.from({ length: 2500 }, (_, i) => ({ id: `v${i}`, values: [1] }));
    await new VectorizeIndexClient(binding).upsert(vecs);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it("returns [] when the index reports no matches", async () => {
    const binding: VectorizeBinding = {
      upsert: () => Promise.resolve({}),
      query: () => Promise.resolve({}),
      deleteByIds: () => Promise.resolve({}),
      getByIds: () => Promise.resolve([]),
    };
    expect(await new VectorizeIndexClient(binding).query([1], { topK: 1 })).toEqual([]);
  });

  it("forwards filter, namespace, and returnMetadata to the binding", async () => {
    let captured: VectorizeQueryOptions | undefined;
    const binding: VectorizeBinding = {
      upsert: () => Promise.resolve({}),
      query: (_v, opts) => {
        captured = opts;
        return Promise.resolve({ matches: [] });
      },
      deleteByIds: () => Promise.resolve({}),
      getByIds: () => Promise.resolve([]),
    };
    await new VectorizeIndexClient(binding).query([1], {
      topK: 3,
      filter: { page_type: { $in: ["spell"] } },
      namespace: "spell",
    });
    expect(captured).toEqual({
      topK: 3,
      returnMetadata: "all",
      filter: { page_type: { $in: ["spell"] } },
      namespace: "spell",
    });
  });
});

describe("createVectorIndexClient", () => {
  beforeEach(() => {
    resetMockVectorIndexClient();
  });

  it("returns a shared mock singleton across calls", () => {
    const a = createVectorIndexClient(baseEnv({ VECTOR_INDEX: "mock" }));
    const b = createVectorIndexClient(baseEnv({ VECTOR_INDEX: "mock" }));
    expect(a).toBeInstanceOf(MockVectorIndexClient);
    expect(a).toBe(b);
  });

  it("returns the Vectorize client when the binding is present", () => {
    const env = baseEnv({ VECTOR_INDEX: "vectorize", VECTORIZE: asVectorize({}) });
    expect(createVectorIndexClient(env)).toBeInstanceOf(VectorizeIndexClient);
  });

  it("throws when vectorize is selected without the binding", () => {
    expect(() => createVectorIndexClient(baseEnv({ VECTOR_INDEX: "vectorize" }))).toThrow(
      VectorIndexError,
    );
  });

  it("returns the discard client for VECTOR_INDEX=discard and holds nothing", async () => {
    const c = createVectorIndexClient(baseEnv({ VECTOR_INDEX: "discard" }));
    expect(c).toBeInstanceOf(NoopVectorIndexClient);
    await c.upsert([{ id: "a", values: [1] }]);
    expect(await c.query([1], { topK: 5 })).toEqual([]);
  });
});
