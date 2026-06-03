import { describe, expect, it } from "vitest";
import { EmbeddingError } from "../src/embedding/types.ts";
import { LlmError } from "../src/llm/types.ts";
import { VectorIndexError } from "../src/vector/types.ts";
import { ObjectStoreError } from "../src/store/types.ts";

/**
 * Each provider seam declares an Error subclass with an optional `cause`. These
 * cover both branches of the `cause !== undefined ? { cause } : undefined`
 * guard and assert the consistent `name` shape.
 */
const cases = [
  { Ctor: EmbeddingError, name: "EmbeddingError" },
  { Ctor: LlmError, name: "LlmError" },
  { Ctor: VectorIndexError, name: "VectorIndexError" },
  { Ctor: ObjectStoreError, name: "ObjectStoreError" },
] as const;

describe("provider error classes", () => {
  for (const { Ctor, name } of cases) {
    it(`${name} carries a message and no cause when none is given`, () => {
      const err = new Ctor("boom");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe(name);
      expect(err.message).toBe("boom");
      expect(err.cause).toBeUndefined();
    });

    it(`${name} propagates a provided cause`, () => {
      const root = new Error("root");
      const err = new Ctor("wrapped", root);
      expect(err.cause).toBe(root);
    });
  }
});
