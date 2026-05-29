import type { IUserDatabaseProvisioner, UserDatabase } from "./types.ts";

/**
 * Local-dev / no-credentials fallback per ADR-0002. Every user maps to the
 * same shared Cloudflare D1 (configured via `USER_DATA_DB` binding +
 * `SHARED_USER_DB_ID` env var). Queries against the shared DB are
 * partitioned by user_id by every Phase 5 sync handler.
 *
 * Migrations are applied to the shared D1 out-of-band (operator runs
 * `wrangler d1 migrations apply reyn_user_data_shared`); provision() does
 * NOT apply them per-call. Tests rely on the pool to seed migrations.
 */
export class SharedProvisioner implements IUserDatabaseProvisioner {
  constructor(private readonly sharedDatabaseId: string) {}

  public provision(_userId: string): Promise<UserDatabase> {
    return Promise.resolve({
      databaseId: this.sharedDatabaseId,
      region: "SHARED",
    });
  }

  public deprovision(_database: UserDatabase): Promise<void> {
    // No-op: the shared DB outlives any single user. Phase 11+ could add
    // `DELETE FROM events WHERE user_id = ?` etc. on logical deletion.
    return Promise.resolve();
  }
}
