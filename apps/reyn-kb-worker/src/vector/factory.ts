import type { Env } from "../types/env.ts";
import { MockVectorIndexClient } from "./MockVectorIndexClient.ts";
import { VectorizeIndexClient, type VectorizeBinding } from "./VectorizeIndexClient.ts";
import { VectorIndexError, type IVectorIndexClient } from "./types.ts";

/**
 * Module-level singleton for the mock vector index. Vectorize has NO local
 * emulator, so the content/index/verify flows test against this mock client —
 * but those flows span multiple worker requests within a single test (store →
 * index → verify), each calling {@link createVectorIndexClient} afresh. A new
 * instance per call would lose every vector upserted by a prior request. The
 * singleton keeps upserts visible across requests in the same isolate. Tests
 * call {@link resetMockVectorIndexClient} in `beforeEach` to stay isolated.
 */
let mockSingleton: MockVectorIndexClient | undefined;

function getMockSingleton(): MockVectorIndexClient {
  mockSingleton ??= new MockVectorIndexClient();
  return mockSingleton;
}

/** Clears the singleton mock vector index so tests don't leak state. */
export function resetMockVectorIndexClient(): void {
  mockSingleton = undefined;
}

/**
 * Selects the active vector index client per `env.VECTOR_INDEX`. Throws a
 * VectorIndexError if the vectorize mode is requested without the VECTORIZE
 * binding — fail-fast at the boundary instead of at first use.
 */
export function createVectorIndexClient(env: Env): IVectorIndexClient {
  switch (env.VECTOR_INDEX) {
    case "mock":
      return getMockSingleton();
    case "vectorize": {
      if (env.VECTORIZE === undefined) {
        throw new VectorIndexError("VECTORIZE binding must be present when VECTOR_INDEX=vectorize");
      }
      // The generated VectorizeIndex type uses a narrower metadata type than our
      // structural VectorizeBinding, so step through `unknown` (two separate
      // casts, not a banned nested `as ... as`).
      const opaque: unknown = env.VECTORIZE;
      const binding = opaque as VectorizeBinding;
      return new VectorizeIndexClient(binding);
    }
  }
}
