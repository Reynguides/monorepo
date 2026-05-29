/**
 * Per-user database provisioning. Per ADR-0002, each user gets a dedicated
 * Cloudflare D1 in production. The shared and mock paths exist for local
 * dev / no-credentials CI.
 */

/** A handle to a user's database, returned from provisioning. */
export interface UserDatabase {
  /** Cloudflare D1 UUID (dedicated/shared) or a synthetic id (mock). */
  readonly databaseId: string;
  /** Region hint, when known (e.g. "WEUR"). */
  readonly region?: string;
}

export interface IUserDatabaseProvisioner {
  /**
   * Idempotent: calling twice for the same userId returns the same handle.
   * Implementations are expected to be safe to call from a register flow.
   */
  provision(userId: string): Promise<UserDatabase>;

  /**
   * Best-effort cleanup. For the dedicated provisioner this deletes the
   * Cloudflare D1; for shared and mock this is typically a no-op.
   */
  deprovision(database: UserDatabase): Promise<void>;
}

/** Errors raised by provisioners surface a consistent shape for handlers. */
export class ProvisioningError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "ProvisioningError";
  }
}
