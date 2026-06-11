import type { ILlmProvider, LlmInput } from "./types.ts";

/** Marker prefix every mock answer carries so tests can assert deterministically. */
export const MOCK_LLM_MARKER = "[mock-llm]";

/**
 * Deterministic LLM provider for local dev + tests. Echoes a stable summary of
 * the input (marker + truncated prompt) so callers exercise the full pipeline
 * without a live model, and tests can assert on the exact output.
 */
export class MockLlmProvider implements ILlmProvider {
  public generate(input: LlmInput): Promise<string> {
    const promptSummary = input.prompt.slice(0, 80);
    const systemPart = input.system !== undefined ? ` system="${input.system.slice(0, 40)}"` : "";
    return Promise.resolve(`${MOCK_LLM_MARKER}${systemPart} ${promptSummary}`);
  }
}
