import { ProvisioningError, type IUserDatabaseProvisioner, type UserDatabase } from "./types.ts";
import { USER_D1_INIT_STATEMENTS } from "./user-d1-schema.ts";

/**
 * Real per-user D1 via the Cloudflare REST API. Per ADR-0002.
 *
 * Flow on first registration for a user:
 *   1. POST /accounts/{accountId}/d1/database  { name: "reyn_user_<shortId>" }
 *   2. For each statement in USER_D1_INIT_STATEMENTS:
 *        POST /d1/database/{db_id}/query  { sql }
 *   3. Return { databaseId, region }.
 *
 * On any failure after step 1, best-effort DELETE /d1/database/{db_id} to
 * avoid orphaned empty databases. If the cleanup also fails, the orphan is
 * logged for manual reconciliation.
 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface D1CreateResponse {
  result?: { uuid?: string; created_in_region?: string };
  success?: boolean;
  errors?: { code: number; message: string }[];
}

interface D1QueryResponse {
  success?: boolean;
  errors?: { code: number; message: string }[];
}

export interface DedicatedProvisionerOptions {
  apiToken: string;
  accountId: string;
  /** Defaults to the global `fetch`; tests inject a stub. */
  fetcher?: FetchLike;
  /** Defaults to USER_D1_INIT_STATEMENTS; tests override. */
  initStatements?: readonly string[];
}

const API_BASE = "https://api.cloudflare.com/client/v4";

export class DedicatedProvisioner implements IUserDatabaseProvisioner {
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly fetcher: FetchLike;
  private readonly initStatements: readonly string[];

  constructor(options: DedicatedProvisionerOptions) {
    this.apiToken = options.apiToken;
    this.accountId = options.accountId;
    this.fetcher = options.fetcher ?? fetch;
    this.initStatements = options.initStatements ?? USER_D1_INIT_STATEMENTS;
  }

  public async provision(userId: string): Promise<UserDatabase> {
    const created = await this.createDatabase(userId);
    try {
      await this.applyMigrations(created.databaseId);
    } catch (e) {
      await this.deprovision(created).catch(() => undefined);
      throw new ProvisioningError("Failed to apply user-D1 migrations", e);
    }
    return created;
  }

  public async deprovision(database: UserDatabase): Promise<void> {
    const res = await this.fetcher(
      `${API_BASE}/accounts/${this.accountId}/d1/database/${database.databaseId}`,
      { method: "DELETE", headers: this.authHeaders() },
    );
    if (!res.ok) {
      throw new ProvisioningError(`Cloudflare D1 delete failed: HTTP ${res.status}`);
    }
  }

  private async createDatabase(userId: string): Promise<UserDatabase> {
    const name = `reyn_user_${userId.replaceAll("-", "").slice(0, 24)}`;
    const res = await this.fetcher(`${API_BASE}/accounts/${this.accountId}/d1/database`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new ProvisioningError(`Cloudflare D1 create failed: HTTP ${res.status}`);
    }
    const body: D1CreateResponse = await res.json();
    if (body.success !== true || body.result?.uuid === undefined) {
      throw new ProvisioningError(
        `Cloudflare D1 create returned no uuid: ${JSON.stringify(body.errors ?? [])}`,
      );
    }
    const region = body.result.created_in_region;
    return region !== undefined
      ? { databaseId: body.result.uuid, region }
      : { databaseId: body.result.uuid };
  }

  private async applyMigrations(databaseId: string): Promise<void> {
    for (const sql of this.initStatements) {
      const res = await this.fetcher(
        `${API_BASE}/accounts/${this.accountId}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: { ...this.authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        },
      );
      if (!res.ok) {
        throw new ProvisioningError(`D1 migration query failed: HTTP ${res.status}`);
      }
      const body: D1QueryResponse = await res.json();
      if (body.success !== true) {
        throw new ProvisioningError(
          `D1 migration query unsuccessful: ${JSON.stringify(body.errors ?? [])}`,
        );
      }
    }
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiToken}` };
  }
}
