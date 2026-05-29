import { env, applyD1Migrations } from "cloudflare:test";

/**
 * Apply migrations once before any tests run. The test D1 bindings are
 * provisioned fresh per Vitest worker; without these calls the auth +
 * user-data tables don't exist.
 */
await applyD1Migrations(env.ACCOUNTS_DB, env.ACCOUNTS_MIGRATIONS);
await applyD1Migrations(env.USER_DATA_DB, env.USER_DATA_MIGRATIONS);
