import type { Env } from "../types/env.ts";
import { MockVectorIndexClient } from "./MockVectorIndexClient.ts";
import { VectorizeIndexClient, type VectorizeBinding } from "./VectorizeIndexClient.ts";
import { VectorIndexError, type IVectorIndexClient } from "./types.ts";

/**
 * Selects the active vector index client per `env.VECTOR_INDEX`. Throws a
 * VectorIndexError if the vectorize mode is requested without the VECTORIZE
 * binding — fail-fast at the boundary instead of at first use.
 */
export function createVectorIndexClient(env: Env): IVectorIndexClient {
  switch (env.VECTOR_INDEX) {
    case "mock":
      return new MockVectorIndexClient();
    case "vectorize": {
      if (env.VECTORIZE === undefined) {
        throw new VectorIndexError("VECTORIZE binding must be present when VECTOR_INDEX=vectorize");
      }
      // The generated VectorizeIndex type uses a narrower metadata type than our
      // structural VectorizeBinding, so the two don't directly overlap. We rely
      // on runtime structural compatibility at the methods we call. Step through
      // `unknown` (two separate casts, not a banned nested `as ... as`).
      const opaque: unknown = env.VECTORIZE;
      const binding = opaque as VectorizeBinding;
      return new VectorizeIndexClient(binding);
    }
  }
}
