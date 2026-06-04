/**
 * LLM provider seam. Generates a text answer from a prompt (with an optional
 * system instruction). The mock path returns a deterministic, prompt-derived
 * string so tests can assert on it; the OpenRouter path calls a live model via
 * the Cloudflare AI Gateway.
 */

export interface LlmInput {
  system?: string;
  prompt: string;
  /**
   * Sampling temperature forwarded to the live model (OpenRouter path). Lower
   * values (0.0–0.2) reduce creativity and hallucination, which suits grounded,
   * context-only answering. Omitted → the provider's own default. The mock
   * provider ignores it (its output is deterministic).
   */
  temperature?: number;
}

export interface ILlmProvider {
  generate(input: LlmInput): Promise<string>;
}

/** Errors raised by LLM providers surface a consistent shape. */
export class LlmError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "LlmError";
  }
}
