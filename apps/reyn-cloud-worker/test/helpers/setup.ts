import { env, applyD1Migrations } from "cloudflare:test";

/**
 * Apply migrations once before any tests run. The test D1 binding is
 * provisioned fresh per Vitest worker; without this call the auth tables
 * don't exist.
 */
await applyD1Migrations(env.ACCOUNTS_DB, env.ACCOUNTS_MIGRATIONS);
