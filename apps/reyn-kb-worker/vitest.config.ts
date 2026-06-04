import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // KB_DB (D1) + KB_BUCKET (R2) come from wrangler.toml (both have local
          // emulators). Vectorize + Workers AI have no emulator, so the selector
          // vars are pinned to "mock" here — tests never touch live Cloudflare.
          // D1 migrations are wired in P1 (there is no schema yet at P0).
          bindings: {
            EMBEDDING_PROVIDER: "mock",
            VECTOR_INDEX: "mock",
            OBJECT_STORE: "r2",
            KB_INGEST_KEY: "test-ingest-key",
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
