import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // No resource bindings — this worker only orchestrates HTTP + an LLM
          // seam. Pin the selectors to "mock" so tests never reach the network
          // (KbSearchClient) or a live model (LlmProvider). KB_BASE_URL is set
          // but unused under KB_SEARCH=mock.
          bindings: {
            KB_SEARCH: "mock",
            KB_BASE_URL: "http://kb.test",
            LLM_PROVIDER: "mock",
            AI_GATEWAY_ACCOUNT_ID: "",
            AI_GATEWAY_NAME: "",
            OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
          },
        },
      },
    },
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**"],
      reporter: ["text-summary", "html", "lcov"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});
