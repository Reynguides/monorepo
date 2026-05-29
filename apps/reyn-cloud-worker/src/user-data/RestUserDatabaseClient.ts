import { UserDatabaseClientError, type IUserDatabaseClient } from "./types.ts";
import type { ServerEventInsert, ServerEventRow } from "../sync/types.ts";
import type { FetchLike } from "../provisioning/DedicatedProvisioner.ts";

/**
 * Talks to a per-user Cloudflare D1 via the REST API
 * (`POST /accounts/{id}/d1/database/{db_id}/query`). Used when
 * `env.PROVISIONER === "dedicated"`, where binding-based access is unavailable
 * because the per-user databases are created dynamically at register-time
 * and the Worker has no static binding to them.
 *
 * Per-user uniqueness (`(user_id, content_hash)`) is enforced at the schema
 * level inside the user's own DB, so INSERT OR IGNORE is sufficient.
 */
const API_BASE = "https://api.cloudflare.com/client/v4";

interface QueryResult<T> {
  result?: { results?: T[]; meta?: { changes?: number } }[];
  success?: boolean;
  errors?: { code: number; message: string }[];
}

export interface RestUserDatabaseClientOptions {
  apiToken: string;
  accountId: string;
  databaseId: string;
  fetcher?: FetchLike;
}

export class RestUserDatabaseClient implements IUserDatabaseClient {
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly databaseId: string;
  private readonly fetcher: FetchLike;

  constructor(options: RestUserDatabaseClientOptions) {
    this.apiToken = options.apiToken;
    this.accountId = options.accountId;
    this.databaseId = options.databaseId;
    this.fetcher = options.fetcher ?? fetch;
  }

  public async insertEvents(events: readonly ServerEventInsert[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }
    const sql =
      "INSERT OR IGNORE INTO events (event_id, user_id, type, occurred_at, payload_json, content_hash, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
    let inserted = 0;
    for (const e of events) {
      const body = await this.query<never>(sql, [
        e.event_id,
        e.user_id,
        e.type,
        e.occurred_at,
        e.payload_json,
        e.content_hash,
        e.received_at,
      ]);
      inserted += body.result?.[0]?.meta?.changes ?? 0;
    }
    return inserted;
  }

  public async listEventsSince(
    userId: string,
    since: number | null,
    limit: number,
  ): Promise<{ items: ServerEventRow[]; nextCursor: number | null }> {
    const body = await this.query<ServerEventRow>(
      "SELECT rowid, event_id, user_id, type, occurred_at, payload_json, content_hash, received_at FROM events WHERE user_id = ? AND rowid > ? ORDER BY rowid LIMIT ?",
      [userId, since ?? 0, limit],
    );
    const items = body.result?.[0]?.results ?? [];
    const nextCursor = items.length === limit ? items[items.length - 1]!.rowid : null;
    return { items, nextCursor };
  }

  public async findIdempotentResponse(userId: string, key: string): Promise<string | null> {
    const body = await this.query<{ response_json: string }>(
      "SELECT response_json FROM sync_idempotency WHERE user_id = ? AND idempotency_key = ?",
      [userId, key],
    );
    const row = body.result?.[0]?.results?.[0];
    return row?.response_json ?? null;
  }

  public async recordIdempotentResponse(
    userId: string,
    key: string,
    responseJson: string,
    nowMs: number,
  ): Promise<void> {
    await this.query<never>(
      "INSERT OR IGNORE INTO sync_idempotency (user_id, idempotency_key, response_json, created_at) VALUES (?, ?, ?, ?)",
      [userId, key, responseJson, nowMs],
    );
  }

  private async query<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
    const res = await this.fetcher(
      `${API_BASE}/accounts/${this.accountId}/d1/database/${this.databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      },
    );
    if (!res.ok) {
      throw new UserDatabaseClientError(`D1 REST query failed: HTTP ${res.status}`);
    }
    const body: QueryResult<T> = await res.json();
    if (body.success !== true) {
      throw new UserDatabaseClientError(
        `D1 REST query unsuccessful: ${JSON.stringify(body.errors ?? [])}`,
      );
    }
    return body;
  }
}
