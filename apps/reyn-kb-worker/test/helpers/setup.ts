import { env, applyD1Migrations } from "cloudflare:test";

/**
 * Apply kb-d1 migrations once before any tests run. The test D1 binding is
 * provisioned fresh per Vitest worker; without this the KB tables don't exist.
 */
await applyD1Migrations(env.KB_DB, env.KB_MIGRATIONS);
