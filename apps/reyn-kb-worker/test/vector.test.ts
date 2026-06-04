import { describe, expect, it, beforeEach } from "vitest";
import { MockVectorIndexClient } from "../src/vector/MockVectorIndexClient.ts";
import { VectorizeIndexClient, type VectorizeBinding } from "../src/vector/VectorizeIndexClient.ts";
import { createVectorIndexClient, resetMockVectorIndexClient } from "../src/vector/factory.ts";
import { VectorIndexError, type VectorRecord } from "../src/vector/types.ts";
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

  it("returns [] when the index reports no matches", async () => {
    const binding: VectorizeBinding = {
      upsert: () => Promise.resolve({}),
      query: () => Promise.resolve({}),
      deleteByIds: () => Promise.resolve({}),
      getByIds: () => Promise.resolve([]),
    };
    expect(await new VectorizeIndexClient(binding).query([1], { topK: 1 })).toEqual([]);
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
});
