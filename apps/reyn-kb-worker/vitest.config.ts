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
          // KB_DB (D1) + KB_BUCKET (R2) come from wrangler.toml (both have local
          // emulators). Vectorize + Workers AI have no emulator, so the selector
          // vars are pinned to "mock" here — tests never touch live Cloudflare.
          // KB_MIGRATIONS carries the kb-d1 SQL so test/helpers/setup.ts can apply
          // it to the per-test D1 (which starts empty).
          bindings: {
            EMBEDDING_PROVIDER: "mock",
            VECTOR_INDEX: "mock",
            OBJECT_STORE: "r2",
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
