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
          // D1 binding is read from wrangler.toml. Pool v0.8 errors out
          // ("Expected object, received string") when both layers declare
          // the same binding, so keep KB_DB only in wrangler.toml.
          //
          // Vectorize + Workers AI have NO local emulator, so all four provider
          // selector vars are forced to "mock" here — tests never touch live
          // Cloudflare. Real adapters are unit-tested with injected stubs.
          bindings: {
            EMBEDDING_PROVIDER: "mock",
            VECTOR_INDEX: "mock",
            OBJECT_STORE: "mock",
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
