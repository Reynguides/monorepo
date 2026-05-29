import type { Context, Handler } from "hono";
import type { AuthVariables, Env } from "../../types/env.ts";
import { IdempotencyKey, PushRequest } from "../../schemas/sync.ts";
import { fail } from "../../lib/errors.ts";
import { computeContentHash } from "../../lib/content-hash.ts";
import { findDatabaseIdForUser } from "../../repo/user-databases.ts";
import { createUserDatabaseClient } from "../../user-data/factory.ts";
import { UserDatabaseClientError, type IUserDatabaseClient } from "../../user-data/types.ts";
import type {
  ClientEventInput,
  PushResponse,
  ServerEventInsert,
} from "../../sync/types.ts";

/**
 * POST /v1/sync/push
 *
 * Wire shape: `{ events: ClientEvent[] }`. Server stamps `received_at`,
 * recomputes `content_hash`, and inserts with `INSERT OR IGNORE` so any
 * (user_id, content_hash) collision is dedup'd silently.
 *
 * The optional `Idempotency-Key` header makes the *whole batch's* response
 * stable across replays: if the client retries after a flaky network and
 * the server already processed the batch, the cached response is returned
 * verbatim instead of re-running the inserts (which would be 100% duplicates
 * anyway but would mislead the client into thinking nothing was new).
 */
export const pushHandler: Handler<{ Bindings: Env; Variables: AuthVariables }> = async (c) => {
  const session = c.var.session;

  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = PushRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }

  const idempotency = parseIdempotencyKey(c);
  if (idempotency.kind === "invalid") {
    return fail(c, 400, "invalid_idempotency_key");
  }
  const idempotencyKey = idempotency.key;

  const client = await resolveClient(c);
  if (client instanceof Response) {
    return client;
  }

  if (idempotencyKey !== null) {
    const cached = await client.findIdempotentResponse(session.userId, idempotencyKey);
    if (cached !== null) {
      return c.json(JSON.parse(cached) as PushResponse, 200);
    }
  }

  const now = Date.now();
  const inserts = await buildInserts(session.userId, parsed.data.events, now);
  const accepted = await client.insertEvents(inserts);
  const response: PushResponse = { accepted, duplicates: inserts.length - accepted };

  if (idempotencyKey !== null) {
    await client.recordIdempotentResponse(
      session.userId,
      idempotencyKey,
      JSON.stringify(response),
      now,
    );
  }

  return c.json(response, 200);
};

type IdempotencyParse = { kind: "absent"; key: null } | { kind: "present"; key: string } | { kind: "invalid"; key: null };

function parseIdempotencyKey(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): IdempotencyParse {
  const header = c.req.header("Idempotency-Key");
  if (header === undefined) {
    return { kind: "absent", key: null };
  }
  const result = IdempotencyKey.safeParse(header);
  return result.success ? { kind: "present", key: result.data } : { kind: "invalid", key: null };
}

async function resolveClient(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<IUserDatabaseClient | Response> {
  const dbId = await findDatabaseIdForUser(c.env.ACCOUNTS_DB, c.var.session.userId);
  if (!dbId) {
    return fail(c, 500, "user_database_missing");
  }
  try {
    return createUserDatabaseClient(c.env, dbId);
  } catch (e) {
    if (e instanceof UserDatabaseClientError) {
      return fail(c, 500, "server_misconfigured", e.message);
    }
    /* istanbul ignore next -- factory only throws UserDatabaseClientError. */
    throw e;
  }
}

async function buildInserts(
  userId: string,
  events: readonly ClientEventInput[],
  nowMs: number,
): Promise<ServerEventInsert[]> {
  const out: ServerEventInsert[] = [];
  for (const ev of events) {
    const contentHash = await computeContentHash(
      userId,
      ev.type,
      ev.occurredAt,
      ev.payloadJson,
    );
    out.push({
      event_id: ev.eventId,
      user_id: userId,
      type: ev.type,
      occurred_at: ev.occurredAt,
      payload_json: ev.payloadJson,
      content_hash: contentHash,
      received_at: nowMs,
    });
  }
  return out;
}
