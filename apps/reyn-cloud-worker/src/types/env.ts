/**
 * Worker bindings + secrets. Mirrors wrangler.toml.
 *
 * Secrets (set via `wrangler secret put`) are typed here as `string`. If a
 * required secret is missing at runtime, the auth handlers respond 500 with
 * a clear message — see ADR-0006.
 */
export interface Env {
  // D1 bindings
  ACCOUNTS_DB: D1Database;

  // Vars (wrangler.toml)
  PROVISIONER: "shared" | "dedicated" | "mock";

  // Secrets
  SESSION_PEPPER: string;
  // Phase 4:
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

/**
 * Per-request context variables set by middleware and consumed by handlers.
 */
export interface AuthVariables {
  session: AuthenticatedSession;
}

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
}
