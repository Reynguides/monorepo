/**
 * Shapes shared between the sync handlers and the user-database client.
 * Wire shapes (validated by Zod) live in `../schemas/sync.ts`; this file
 * holds the internal types that downstream code passes around.
 */

/** A row as stored in the user's `events` table. */
export interface ServerEventRow {
  rowid: number;
  event_id: string;
  user_id: string;
  type: string;
  occurred_at: number;
  payload_json: string;
  content_hash: string;
  received_at: number;
}

/** What the client sends per event, before the server stamps it. */
export interface ClientEventInput {
  eventId: string;
  type: string;
  occurredAt: number;
  payloadJson: string;
}

/** What the server inserts after recomputing `content_hash` + `received_at`. */
export interface ServerEventInsert {
  event_id: string;
  user_id: string;
  type: string;
  occurred_at: number;
  payload_json: string;
  content_hash: string;
  received_at: number;
}

/** Push response body (also the value stored under an Idempotency-Key). */
export interface PushResponse {
  accepted: number;
  duplicates: number;
}

/** Pull response page. */
export interface PullResponse {
  items: ClientEventOutput[];
  nextCursor: number | null;
}

/** The client-facing event shape returned by /v1/sync/pull. */
export interface ClientEventOutput {
  eventId: string;
  type: string;
  occurredAt: number;
  payloadJson: string;
  contentHash: string;
  receivedAt: number;
  cursor: number;
}
