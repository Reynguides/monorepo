import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const kbMigrationsPath = path.join(import.meta.dirname, "..", "..", "migrations", "kb-d1");
const kbMigrations = await readD1Migrations(kbMigrationsPath);

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // D1 + R2 bindings are read from wrangler.toml. Pool v0.8 errors out
          // ("Expected object, received string") when both layers declare
          // the same binding, so keep KB_DB / KB_BUCKET only in wrangler.toml;
          // miniflare provides the R2 emulator for KB_BUCKET locally.
          //
          // R2 HAS a local emulator, so OBJECT_STORE="r2" here exercises the real
          // R2ObjectStore against local R2 (store→get persists across requests
          // within a test). Vectorize + Workers AI have NO emulator, so those
          // selector vars stay "mock" — tests never touch live Cloudflare. D1+R2
          // reset between tests via vitest-pool-workers' isolated per-test storage.
          bindings: {
            EMBEDDING_PROVIDER: "mock",
            VECTOR_INDEX: "mock",
            OBJECT_STORE: "r2",
            LLM_PROVIDER: "mock",
            KB_INGEST_KEY: "test-ingest-key",
            KB_MIGRATIONS: kbMigrations,
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
