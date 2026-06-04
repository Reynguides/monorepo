import { describe, expect, it, vi } from "vitest";
import { MockEmbeddingProvider } from "../src/embedding/MockEmbeddingProvider.ts";
import {
  WorkersAiEmbeddingProvider,
  BGE_BASE_MODEL,
} from "../src/embedding/WorkersAiEmbeddingProvider.ts";
import { createEmbeddingProvider } from "../src/embedding/factory.ts";
import { EMBEDDING_DIM, EmbeddingError } from "../src/embedding/types.ts";
import type { Env } from "../src/types/env.ts";

/** Single-cast a structural stub to a binding type (avoids the double-as ban). */
function asAi(x: unknown): Ai {
  return x as Ai;
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

describe("MockEmbeddingProvider", () => {
  it("produces deterministic 768-dim unit vectors, distinct per text", async () => {
    const p = new MockEmbeddingProvider();
    const [v1] = await p.embed(["fireball"]);
    const [v1again] = await p.embed(["fireball"]);
    expect(v1!.length).toBe(EMBEDDING_DIM);
    expect(v1).toEqual(v1again);
    expect(Math.sqrt(v1!.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
    const [v2] = await p.embed(["ice knife"]);
    expect(v2).not.toEqual(v1);
  });
});

describe("WorkersAiEmbeddingProvider (injected stub runner)", () => {
  it("returns [] for empty input without calling the model", async () => {
    const run = vi.fn();
    expect(await new WorkersAiEmbeddingProvider({ run }).embed([])).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("calls bge-base and returns the data", async () => {
    const run = vi.fn().mockResolvedValue({
      data: [
        [1, 2],
        [3, 4],
      ],
    });
    const out = await new WorkersAiEmbeddingProvider({ run }).embed(["a", "b"]);
    expect(out).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(run).toHaveBeenCalledWith(BGE_BASE_MODEL, { text: ["a", "b"] });
  });

  it("throws on missing data and on a count mismatch", async () => {
    const noData = vi.fn().mockResolvedValue({});
    await expect(
      new WorkersAiEmbeddingProvider({ run: noData }).embed(["a"]),
    ).rejects.toBeInstanceOf(EmbeddingError);
    const mismatch = vi.fn().mockResolvedValue({ data: [[1]] });
    await expect(
      new WorkersAiEmbeddingProvider({ run: mismatch }).embed(["a", "b"]),
    ).rejects.toBeInstanceOf(EmbeddingError);
  });
});

describe("createEmbeddingProvider", () => {
  it("returns the mock provider in mock mode", () => {
    expect(createEmbeddingProvider(baseEnv({ EMBEDDING_PROVIDER: "mock" }))).toBeInstanceOf(
      MockEmbeddingProvider,
    );
  });

  it("returns the Workers AI provider when the AI binding is present", () => {
    const env = baseEnv({ EMBEDDING_PROVIDER: "workers-ai", AI: asAi({ run: vi.fn() }) });
    expect(createEmbeddingProvider(env)).toBeInstanceOf(WorkersAiEmbeddingProvider);
  });

  it("throws when workers-ai is selected without the AI binding", () => {
    expect(() => createEmbeddingProvider(baseEnv({ EMBEDDING_PROVIDER: "workers-ai" }))).toThrow(
      EmbeddingError,
    );
  });
});
