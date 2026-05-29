/**
 * Worker bindings + secrets. Mirrors wrangler.toml.
 *
 * Secrets (set via `wrangler secret put`) are typed here. If a required
 * secret is missing at runtime, handlers respond 500 with a clear message.
 */
export interface Env {
  // D1 bindings
  ACCOUNTS_DB: D1Database;
  // Shared user-data D1; bound when PROVISIONER=shared. Unused under
  // PROVISIONER=dedicated (which talks to per-user D1s via REST instead).
  USER_DATA_DB?: D1Database;

  // Vars (wrangler.toml)
  PROVISIONER: "shared" | "dedicated" | "mock";
  /** Cloudflare D1 UUID of the shared user-data DB. Required when PROVISIONER=shared. */
  SHARED_USER_DB_ID?: string;

  // Secrets
  SESSION_PEPPER: string;
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
