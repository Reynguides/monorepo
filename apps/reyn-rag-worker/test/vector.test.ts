import { describe, expect, it, vi } from "vitest";
import { createVectorIndexClient } from "../src/vector/factory.ts";
import { MockVectorIndexClient } from "../src/vector/MockVectorIndexClient.ts";
import { VectorizeIndexClient, type VectorizeBinding } from "../src/vector/VectorizeIndexClient.ts";
import { VectorIndexError } from "../src/vector/types.ts";
import type { Env } from "../src/types/env.ts";

function baseEnv(overrides: Partial<Env>): Env {
  return {
    KB_DB: {} as D1Database,
    EMBEDDING_PROVIDER: "mock",
    VECTOR_INDEX: "mock",
    OBJECT_STORE: "mock",
    LLM_PROVIDER: "mock",
    ...overrides,
  };
}

describe("createVectorIndexClient", () => {
  it("returns the mock client in mock mode", () => {
    expect(createVectorIndexClient(baseEnv({ VECTOR_INDEX: "mock" }))).toBeInstanceOf(
      MockVectorIndexClient,
    );
  });

  it("returns the vectorize client when VECTORIZE is bound", () => {
    const stub: unknown = {};
    const vectorize = stub as VectorizeIndex;
    expect(
      createVectorIndexClient(baseEnv({ VECTOR_INDEX: "vectorize", VECTORIZE: vectorize })),
    ).toBeInstanceOf(VectorizeIndexClient);
  });

  it("throws when vectorize is selected without the binding", () => {
    expect(() => createVectorIndexClient(baseEnv({ VECTOR_INDEX: "vectorize" }))).toThrow(
      VectorIndexError,
    );
  });
});

describe("MockVectorIndexClient", () => {
  it("ranks by cosine similarity and respects topK", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "near", values: [1, 0, 0], metadata: { tag: "n" } },
      { id: "mid", values: [1, 1, 0] },
      { id: "far", values: [0, 0, 1] },
    ]);
    const matches = await c.query([1, 0, 0], { topK: 2 });
    expect(matches).toHaveLength(2);
    expect(matches[0]!.id).toBe("near");
    expect(matches[0]!.score).toBeCloseTo(1, 5);
    expect(matches[0]!.metadata).toEqual({ tag: "n" });
    expect(matches[1]!.id).toBe("mid");
  });

  it("returns score 0 against a zero vector", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([{ id: "z", values: [0, 0, 0] }]);
    const matches = await c.query([1, 1, 1], { topK: 1 });
    expect(matches[0]!.score).toBe(0);
  });

  it("compares vectors of differing lengths over the shared prefix", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([{ id: "short", values: [1, 0] }]);
    // Query vector is longer than the stored one; cosine uses only the shared
    // prefix [1, 0] for both, so the extra query dims are ignored entirely.
    const matches = await c.query([1, 0, 5, 5], { topK: 1 });
    expect(matches[0]!.id).toBe("short");
    expect(matches[0]!.score).toBeCloseTo(1, 5);
  });

  it("computes a valid cosine score when stored vector is longer than query", async () => {
    const c = new MockVectorIndexClient();
    // Stored vector has 4 dims; query has only 2. Cosine over the shared prefix
    // [1, 0] should still yield a perfect score (both point the same direction).
    await c.upsert([
      { id: "long-stored", values: [1, 0, 5, 5] },
      { id: "other", values: [0, 1, 0, 0] },
    ]);
    const matches = await c.query([1, 0], { topK: 2 });
    expect(matches[0]!.id).toBe("long-stored");
    expect(matches[0]!.score).toBeCloseTo(1, 5);
    expect(matches[1]!.id).toBe("other");
    expect(matches[1]!.score).toBeCloseTo(0, 5);
  });

  it("upsert replaces an existing id", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([{ id: "x", values: [1, 0] }]);
    await c.upsert([{ id: "x", values: [0, 1] }]);
    const refs = await c.getByIds(["x"]);
    expect(refs).toHaveLength(1);
  });

  it("deleteByIds removes vectors", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([
      { id: "a", values: [1] },
      { id: "b", values: [1] },
    ]);
    await c.deleteByIds(["a"]);
    const matches = await c.query([1], { topK: 10 });
    expect(matches.map((m) => m.id)).toEqual(["b"]);
  });

  it("getByIds returns only existing ids with metadata", async () => {
    const c = new MockVectorIndexClient();
    await c.upsert([{ id: "a", values: [1], metadata: { k: 1 } }]);
    const refs = await c.getByIds(["a", "missing"]);
    expect(refs).toEqual([{ id: "a", metadata: { k: 1 } }]);
  });
});

describe("VectorizeIndexClient", () => {
  function stub(): VectorizeBinding & {
    upsert: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    deleteByIds: ReturnType<typeof vi.fn>;
    getByIds: ReturnType<typeof vi.fn>;
  } {
    return {
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      query: vi.fn().mockResolvedValue({ matches: [{ id: "m", score: 0.9 }] }),
      deleteByIds: vi.fn().mockResolvedValue({ count: 1 }),
      getByIds: vi.fn().mockResolvedValue([{ id: "g" }]),
    };
  }

  it("delegates upsert to the binding", async () => {
    const s = stub();
    await new VectorizeIndexClient(s).upsert([{ id: "a", values: [1, 2] }]);
    expect(s.upsert).toHaveBeenCalledWith([{ id: "a", values: [1, 2] }]);
  });

  it("delegates query and returns matches", async () => {
    const s = stub();
    const matches = await new VectorizeIndexClient(s).query([1], { topK: 5 });
    expect(s.query).toHaveBeenCalledWith([1], { topK: 5 });
    expect(matches).toEqual([{ id: "m", score: 0.9 }]);
  });

  it("returns an empty array when the binding omits matches", async () => {
    const s = stub();
    s.query.mockResolvedValue({});
    expect(await new VectorizeIndexClient(s).query([1], { topK: 1 })).toEqual([]);
  });

  it("delegates deleteByIds and getByIds", async () => {
    const s = stub();
    const client = new VectorizeIndexClient(s);
    await client.deleteByIds(["x"]);
    expect(s.deleteByIds).toHaveBeenCalledWith(["x"]);
    expect(await client.getByIds(["g"])).toEqual([{ id: "g" }]);
  });
});
