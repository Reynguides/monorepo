import type { Env } from "../types/env.ts";
import { MockLlmProvider } from "./MockLlmProvider.ts";
import { OpenRouterLlmProvider } from "./OpenRouterLlmProvider.ts";
import { LlmError, type ILlmProvider } from "./types.ts";

/**
 * Selects the active LLM provider per `env.LLM_PROVIDER`. Throws an LlmError if
 * the openrouter mode is requested without the API key or AI-Gateway vars —
 * fail-fast at the boundary instead of at first use.
 */
export function createLlmProvider(env: Env): ILlmProvider {
  switch (env.LLM_PROVIDER) {
    case "mock":
      return new MockLlmProvider();
    case "openrouter": {
      const { OPENROUTER_API_KEY, AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_NAME, OPENROUTER_MODEL } = env;
      if (!OPENROUTER_API_KEY || !AI_GATEWAY_ACCOUNT_ID || !AI_GATEWAY_NAME || !OPENROUTER_MODEL) {
        throw new LlmError(
          "OPENROUTER_API_KEY, AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_NAME and OPENROUTER_MODEL must be set when LLM_PROVIDER=openrouter",
        );
      }
      return new OpenRouterLlmProvider({
        apiKey: OPENROUTER_API_KEY,
        accountId: AI_GATEWAY_ACCOUNT_ID,
        gatewayName: AI_GATEWAY_NAME,
        model: OPENROUTER_MODEL,
      });
    }
  }
}
