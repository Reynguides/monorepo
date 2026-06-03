import { describe, expect, it, vi } from "vitest";
import { createEmbeddingProvider } from "../src/embedding/factory.ts";
import { MockEmbeddingProvider } from "../src/embedding/MockEmbeddingProvider.ts";
import {
  WorkersAiEmbeddingProvider,
  BGE_BASE_MODEL,
} from "../src/embedding/WorkersAiEmbeddingProvider.ts";
import { EmbeddingError, EMBEDDING_DIM } from "../src/embedding/types.ts";
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

describe("createEmbeddingProvider", () => {
  it("returns the mock provider in mock mode", () => {
    const p = createEmbeddingProvider(baseEnv({ EMBEDDING_PROVIDER: "mock" }));
    expect(p).toBeInstanceOf(MockEmbeddingProvider);
  });

  it("returns the workers-ai provider when AI is bound", () => {
    const stub: unknown = { run: vi.fn() };
    const ai = stub as Ai;
    const p = createEmbeddingProvider(baseEnv({ EMBEDDING_PROVIDER: "workers-ai", AI: ai }));
    expect(p).toBeInstanceOf(WorkersAiEmbeddingProvider);
  });

  it("throws when workers-ai is selected without the AI binding", () => {
    expect(() => createEmbeddingProvider(baseEnv({ EMBEDDING_PROVIDER: "workers-ai" }))).toThrow(
      EmbeddingError,
    );
  });
});

describe("MockEmbeddingProvider", () => {
  it("produces deterministic 768-dim unit vectors", async () => {
    const p = new MockEmbeddingProvider();
    const [a] = await p.embed(["astarion is a vampire"]);
    const [a2] = await p.embed(["astarion is a vampire"]);
    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(a).toEqual(a2); // stable across calls
    const norm = Math.sqrt(a!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("produces different vectors for different texts", async () => {
    const p = new MockEmbeddingProvider();
    const [a, b] = await p.embed(["shadowheart", "lae'zel"]);
    expect(a).not.toEqual(b);
  });
});

describe("WorkersAiEmbeddingProvider", () => {
  it("returns an empty array without calling AI for empty input", async () => {
    const run = vi.fn();
    const p = new WorkersAiEmbeddingProvider({ run });
    expect(await p.embed([])).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("calls the bge-base model and returns result.data", async () => {
    const vectors = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    const run = vi.fn().mockResolvedValue({ data: vectors });
    const p = new WorkersAiEmbeddingProvider({ run });
    const out = await p.embed(["a", "b"]);
    expect(out).toEqual(vectors);
    expect(run).toHaveBeenCalledWith(BGE_BASE_MODEL, { text: ["a", "b"] });
  });

  it("throws when AI returns no data", async () => {
    const run = vi.fn().mockResolvedValue({});
    const p = new WorkersAiEmbeddingProvider({ run });
    await expect(p.embed(["a"])).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("throws when AI returns fewer vectors than inputs (count contract)", async () => {
    // One input but the model returned zero vectors → would otherwise corrupt
    // the chunk↔vector pairing downstream. Must fail loud instead.
    const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const p = new WorkersAiEmbeddingProvider({ run });
    await expect(p.embed(["a", "b"])).rejects.toBeInstanceOf(EmbeddingError);
  });
});
