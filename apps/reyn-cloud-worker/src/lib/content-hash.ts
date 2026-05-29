import { bytesToHex } from "./hex.ts";

/**
 * Server-side content fingerprint for an event. Per ADR-0007, dedup uses
 * `(user_id, content_hash)`; recomputing on the server side guarantees the
 * client can't smuggle a "unique" hash through duplicate payload.
 *
 * Canonical form: `user_id\ntype\noccurred_at\npayload_json`. Newline is not
 * legal in our type/uuid fields, so collisions across (user, type) pairs are
 * impossible without an outright payload match. We deliberately do NOT
 * canonicalize the JSON itself — clients are responsible for stable
 * serialization (see `EventPayload.cs` on the desktop side); two clients
 * sending semantically-equal but textually-different JSON are treated as
 * different events.
 */
export async function computeContentHash(
  userId: string,
  type: string,
  occurredAt: number,
  payloadJson: string,
): Promise<string> {
  const canonical = `${userId}\n${type}\n${occurredAt}\n${payloadJson}`;
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}
