/**
 * `IUserDatabaseClient` abstracts over the two ways the Worker reads/writes
 * a user's data D1:
 *
 *  - **Shared** mode: a single `USER_DATA_DB` binding is shared across users;
 *    every query is partitioned by `user_id` (see ADR-0002).
 *  - **Dedicated** mode: each user has their own Cloudflare D1 created at
 *    register-time; the Worker talks to it via the Cloudflare REST API
 *    (`POST /d1/database/{id}/query`) since D1 bindings are static.
 *
 * Push/pull handlers depend only on this interface — the `factory.ts`
 * selects the right impl per `env.PROVISIONER`.
 */
import type { ServerEventRow, ServerEventInsert } from "../sync/types.ts";

export interface IUserDatabaseClient {
  /**
   * Inserts a batch of events with `INSERT OR IGNORE` semantics. The
   * server-recomputed `content_hash` is part of the row; per-user uniqueness
   * is enforced by the `events_user_content_idx` index, so duplicate content
   * silently no-ops.
   *
   * Returns the count actually inserted; the caller derives `duplicates` from
   * the input length.
   */
  insertEvents(events: readonly ServerEventInsert[]): Promise<number>;

  /**
   * Cursor-paginated read of events for one user, ordered by rowid.
   * `since` is the last rowid the client has; `null` means start from the
   * beginning. `limit` is capped by the handler.
   */
  listEventsSince(
    userId: string,
    since: number | null,
    limit: number,
  ): Promise<{ items: ServerEventRow[]; nextCursor: number | null }>;

  /**
   * Looks up a cached push response. Returns null on miss.
   */
  findIdempotentResponse(userId: string, key: string): Promise<string | null>;

  /**
   * Records a push response for future replay. The (user_id, key) pair is
   * unique; second writes with the same key are silently dropped via
   * `INSERT OR IGNORE`.
   */
  recordIdempotentResponse(
    userId: string,
    key: string,
    responseJson: string,
    nowMs: number,
  ): Promise<void>;
}

/** Thrown by clients when the underlying transport (REST, D1) fails. */
export class UserDatabaseClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "UserDatabaseClientError";
  }
}
