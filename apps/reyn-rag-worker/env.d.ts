declare module "cloudflare:test" {
  // Augment the cloudflare:test ProvidedEnv with the vars configured in
  // vitest.config.ts. This worker has NO Cloudflare resource bindings — only
  // selector vars + the (unused-in-tests) AI Gateway / OpenRouter config.
  // Tests pin KB_SEARCH and LLM_PROVIDER to "mock" so nothing touches the
  // network or a live model.
  interface ProvidedEnv {
    KB_SEARCH: "http" | "mock";
    KB_BASE_URL: string;
    LLM_PROVIDER: "mock" | "openrouter";
    AI_GATEWAY_ACCOUNT_ID: string;
    AI_GATEWAY_NAME: string;
    OPENROUTER_MODEL: string;
    OPENROUTER_API_KEY?: string;
  }
}

export {};
