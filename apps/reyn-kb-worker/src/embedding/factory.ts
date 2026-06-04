import type { Env } from "../types/env.ts";
import { MockEmbeddingProvider } from "./MockEmbeddingProvider.ts";
import { WorkersAiEmbeddingProvider } from "./WorkersAiEmbeddingProvider.ts";
import { EmbeddingError, type IEmbeddingProvider } from "./types.ts";

/**
 * Selects the active embedding provider per `env.EMBEDDING_PROVIDER`. Throws
 * an EmbeddingError if the workers-ai mode is requested without the AI binding
 * — fail-fast at the boundary instead of at first use.
 */
export function createEmbeddingProvider(env: Env): IEmbeddingProvider {
  switch (env.EMBEDDING_PROVIDER) {
    case "mock":
      return new MockEmbeddingProvider();
    case "workers-ai": {
      if (env.AI === undefined) {
        throw new EmbeddingError("AI binding must be present when EMBEDDING_PROVIDER=workers-ai");
      }
      // The Workers AI binding is structurally compatible with AiEmbeddingRunner.
      return new WorkersAiEmbeddingProvider(env.AI);
    }
  }
}
