import { describe, expect, it, vi } from "vitest";
import { createLlmProvider } from "../src/llm/factory.ts";
import { MockLlmProvider, MOCK_LLM_MARKER } from "../src/llm/MockLlmProvider.ts";
import { OpenRouterLlmProvider } from "../src/llm/OpenRouterLlmProvider.ts";
import { LlmError } from "../src/llm/types.ts";
import type { Env } from "../src/types/env.ts";

function baseEnv(overrides: Partial<Env>): Env {
  return {
    KB_SEARCH: "mock",
    LLM_PROVIDER: "mock",
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}

const openrouterEnv = {
  LLM_PROVIDER: "openrouter" as const,
  OPENROUTER_API_KEY: "sk-test",
  AI_GATEWAY_ACCOUNT_ID: "acct-1",
  AI_GATEWAY_NAME: "reyn-gw",
  OPENROUTER_MODEL: "openai/gpt-4o-mini",
};

describe("createLlmProvider", () => {
  it("returns the mock provider in mock mode", () => {
    expect(createLlmProvider(baseEnv({ LLM_PROVIDER: "mock" }))).toBeInstanceOf(MockLlmProvider);
  });

  it("returns the OpenRouter provider when all vars are set", () => {
    expect(createLlmProvider(baseEnv(openrouterEnv))).toBeInstanceOf(OpenRouterLlmProvider);
  });

  it("throws when openrouter is selected without the API key", () => {
    const { OPENROUTER_API_KEY: _omit, ...rest } = openrouterEnv;
    expect(() => createLlmProvider(baseEnv(rest))).toThrow(LlmError);
  });

  it("throws when openrouter is selected without the gateway name", () => {
    const { AI_GATEWAY_NAME: _omit, ...rest } = openrouterEnv;
    expect(() => createLlmProvider(baseEnv(rest))).toThrow(LlmError);
  });

  it("throws when openrouter is selected without the gateway account id", () => {
    const { AI_GATEWAY_ACCOUNT_ID: _omit, ...rest } = openrouterEnv;
    expect(() => createLlmProvider(baseEnv(rest))).toThrow(LlmError);
  });

  it("throws when openrouter is selected without the model", () => {
    const { OPENROUTER_MODEL: _omit, ...rest } = openrouterEnv;
    expect(() => createLlmProvider(baseEnv(rest))).toThrow(LlmError);
  });
});

describe("MockLlmProvider", () => {
  it("returns a deterministic, prompt-derived answer", async () => {
    const p = new MockLlmProvider();
    const out = await p.generate({ prompt: "Who is Astarion?" });
    expect(out).toContain(MOCK_LLM_MARKER);
    expect(out).toContain("Who is Astarion?");
    expect(await p.generate({ prompt: "Who is Astarion?" })).toBe(out);
  });

  it("includes the system marker when a system prompt is supplied", async () => {
    const p = new MockLlmProvider();
    const out = await p.generate({ system: "You are a guide", prompt: "hi" });
    expect(out).toContain('system="You are a guide"');
  });
});

describe("OpenRouterLlmProvider", () => {
  function makeProvider(fetcher: typeof fetch) {
    return new OpenRouterLlmProvider({
      apiKey: "sk-test",
      accountId: "acct-1",
      gatewayName: "reyn-gw",
      model: "openai/gpt-4o-mini",
      fetcher,
    });
  }

  it("POSTs to the AI Gateway OpenRouter URL and parses the content", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "Astarion is a vampire." } }] }),
      );
    const out = await makeProvider(fetcher).generate({ system: "sys", prompt: "q" });
    expect(out).toBe("Astarion is a vampire.");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct-1/reyn-gw/openrouter/v1/chat/completions",
    );
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
    ]);
  });

  it("omits the system message when none is supplied", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    await makeProvider(fetcher).generate({ prompt: "q" });
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as {
      messages: { role: string }[];
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]!.role).toBe("user");
  });

  it("forwards temperature in the request body when supplied", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    await makeProvider(fetcher).generate({ prompt: "q", temperature: 0.2 });
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as {
      temperature?: number;
    };
    expect(body.temperature).toBe(0.2);
  });

  it("omits temperature from the request body when not supplied", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    await makeProvider(fetcher).generate({ prompt: "q" });
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as {
      temperature?: number;
    };
    expect(body).not.toHaveProperty("temperature");
  });

  it("throws on HTTP non-2xx", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("err", { status: 500 }));
    await expect(makeProvider(fetcher).generate({ prompt: "q" })).rejects.toBeInstanceOf(LlmError);
  });

  it("throws when there are no choices", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }));
    await expect(makeProvider(fetcher).generate({ prompt: "q" })).rejects.toBeInstanceOf(LlmError);
  });

  it("uses the global fetch (correctly bound) when no fetcher is supplied", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    try {
      const out = await new OpenRouterLlmProvider({
        apiKey: "k",
        accountId: "a",
        gatewayName: "g",
        model: "m",
      }).generate({ prompt: "q" });
      expect(out).toBe("ok");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
