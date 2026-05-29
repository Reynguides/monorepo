import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const accountsMigrationsPath = path.join(
  import.meta.dirname,
  "..",
  "..",
  "migrations",
  "accounts-d1",
);
const userDataMigrationsPath = path.join(
  import.meta.dirname,
  "..",
  "..",
  "migrations",
  "user-d1",
);
const accountsMigrations = await readD1Migrations(accountsMigrationsPath);
const userDataMigrations = await readD1Migrations(userDataMigrationsPath);

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // D1 bindings are read from wrangler.toml. Pool v0.8 errors out
          // ("Expected object, received string") when both layers declare
          // the same binding, so keep them only in wrangler.toml.
          bindings: {
            SESSION_PEPPER:
              "00000000000000000000000000000000000000000000000000000000000000ff",
            PROVISIONER: "shared",
            SHARED_USER_DB_ID: "miniflare-shared-test-id",
            ACCOUNTS_MIGRATIONS: accountsMigrations,
            USER_DATA_MIGRATIONS: userDataMigrations,
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
