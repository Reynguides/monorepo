import type { IUserDatabaseClient } from "./types.ts";
import type { ServerEventInsert, ServerEventRow } from "../sync/types.ts";

/**
 * Talks to a single `USER_DATA_DB` D1 binding shared across all users.
 * Every read/write is partitioned by `user_id`. Used when
 * `env.PROVISIONER === "shared"`.
 */
export class SharedUserDatabaseClient implements IUserDatabaseClient {
  constructor(private readonly db: D1Database) {}

  public async insertEvents(events: readonly ServerEventInsert[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }
    const statements = events.map((e) =>
      this.db
        .prepare(
          "INSERT OR IGNORE INTO events (event_id, user_id, type, occurred_at, payload_json, content_hash, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          e.event_id,
          e.user_id,
          e.type,
          e.occurred_at,
          e.payload_json,
          e.content_hash,
          e.received_at,
        ),
    );
    const results = await this.db.batch(statements);
    return results.reduce((acc, r) => acc + (r.meta?.changes ?? 0), 0);
  }

  public async listEventsSince(
    userId: string,
    since: number | null,
    limit: number,
  ): Promise<{ items: ServerEventRow[]; nextCursor: number | null }> {
    const cursor = since ?? 0;
    const result = await this.db
      .prepare(
        "SELECT rowid, event_id, user_id, type, occurred_at, payload_json, content_hash, received_at FROM events WHERE user_id = ? AND rowid > ? ORDER BY rowid LIMIT ?",
      )
      .bind(userId, cursor, limit)
      .all<ServerEventRow>();
    const items = result.results ?? [];
    const nextCursor = items.length === limit ? items[items.length - 1]!.rowid : null;
    return { items, nextCursor };
  }

  public async findIdempotentResponse(userId: string, key: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        "SELECT response_json FROM sync_idempotency WHERE user_id = ? AND idempotency_key = ?",
      )
      .bind(userId, key)
      .first<{ response_json: string }>();
    return row?.response_json ?? null;
  }

  public async recordIdempotentResponse(
    userId: string,
    key: string,
    responseJson: string,
    nowMs: number,
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO sync_idempotency (user_id, idempotency_key, response_json, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(userId, key, responseJson, nowMs)
      .run();
  }
}
