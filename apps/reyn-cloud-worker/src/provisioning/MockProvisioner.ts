import type { IUserDatabaseProvisioner, UserDatabase } from "./types.ts";

/**
 * In-memory, deterministic provisioner. Returns a stable synthetic database
 * id for each userId so tests can assert on it.
 *
 * The handles are stored in an in-memory Map; the same userId always maps
 * to the same handle within an isolate's lifetime.
 */
export class MockProvisioner implements IUserDatabaseProvisioner {
  private readonly handles = new Map<string, UserDatabase>();

  public provision(userId: string): Promise<UserDatabase> {
    const existing = this.handles.get(userId);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    const handle: UserDatabase = {
      databaseId: `mock-${userId}`,
      region: "MOCK",
    };
    this.handles.set(userId, handle);
    return Promise.resolve(handle);
  }

  public deprovision(database: UserDatabase): Promise<void> {
    for (const [userId, handle] of this.handles.entries()) {
      if (handle.databaseId === database.databaseId) {
        this.handles.delete(userId);
        break;
      }
    }
    return Promise.resolve();
  }
}
