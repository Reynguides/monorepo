import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrationsPath = path.join(import.meta.dirname, "..", "..", "migrations", "accounts-d1");
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: ["ACCOUNTS_DB"],
          bindings: {
            SESSION_PEPPER:
              "00000000000000000000000000000000000000000000000000000000000000ff",
            PROVISIONER: "shared",
            ACCOUNTS_MIGRATIONS: migrations,
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
