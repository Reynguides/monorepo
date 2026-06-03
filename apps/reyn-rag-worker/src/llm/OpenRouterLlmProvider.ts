import { LlmError, type ILlmProvider, type LlmInput } from "./types.ts";

/** Defaults to the global `fetch`; tests inject a stub. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Shape of the OpenAI-style chat-completions response we parse. */
interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export interface OpenRouterLlmProviderOptions {
  apiKey: string;
  accountId: string;
  gatewayName: string;
  model: string;
  fetcher?: FetchLike;
}

/**
 * Real LLM provider that POSTs OpenAI-style chat completions to OpenRouter via
 * the Cloudflare AI Gateway. The `fetcher` is constructor-injected so the
 * adapter is unit-tested with a `vi.fn()` (mirrors RestUserDatabaseClient).
 */
export class OpenRouterLlmProvider implements ILlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly url: string;
  private readonly fetcher: FetchLike;

  constructor(options: OpenRouterLlmProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.url = `https://gateway.ai.cloudflare.com/v1/${options.accountId}/${options.gatewayName}/openrouter/v1/chat/completions`;
    this.fetcher = options.fetcher ?? fetch;
  }

  public async generate(input: LlmInput): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (input.system !== undefined) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push({ role: "user", content: input.prompt });

    const res = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, messages }),
    });
    if (!res.ok) {
      throw new LlmError(`OpenRouter chat completion failed: HTTP ${res.status}`);
    }
    const body: ChatCompletionResponse = await res.json();
    const content = body.choices?.[0]?.message?.content;
    if (content === undefined) {
      throw new LlmError("OpenRouter chat completion returned no choices");
    }
    return content;
  }
}
