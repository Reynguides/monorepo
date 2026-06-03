import { EmbeddingError, type IEmbeddingProvider } from "./types.ts";

/** The bge-base model exposed by Workers AI; 768-dim sentence embeddings. */
export const BGE_BASE_MODEL = "@cf/baai/bge-base-en-v1.5";

/** Shape of the Workers AI embedding response we consume. */
interface AiEmbeddingResult {
  data?: number[][];
}

/**
 * Minimal structural view of the Workers AI binding we depend on. Defined
 * locally (rather than coupling to the heavily-overloaded `Ai` type) so the
 * adapter is trivially unit-testable with a `{ run: vi.fn() }` stub.
 */
export interface AiEmbeddingRunner {
  run(model: string, input: { text: string[] }): Promise<AiEmbeddingResult>;
}

/**
 * Real embedding provider backed by Workers AI. Workers AI has no local
 * emulator, so this is exercised in tests via an injected stub runner; the
 * production binding (`env.AI`) is structurally compatible.
 */
export class WorkersAiEmbeddingProvider implements IEmbeddingProvider {
  private readonly ai: AiEmbeddingRunner;

  constructor(ai: AiEmbeddingRunner) {
    this.ai = ai;
  }

  public async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const result = await this.ai.run(BGE_BASE_MODEL, { text: [...texts] });
    const data = result.data;
    if (data === undefined) {
      throw new EmbeddingError("Workers AI embedding returned no data");
    }
    if (data.length !== texts.length) {
      // The provider contract is one vector per input, in order. A length
      // mismatch would silently corrupt the chunk↔vector pairing downstream
      // (zero-length vectors upserted + ledger rows recorded), so fail loud.
      throw new EmbeddingError(
        `Workers AI embedding count mismatch: expected ${texts.length}, got ${data.length}`,
      );
    }
    return data;
  }
}
