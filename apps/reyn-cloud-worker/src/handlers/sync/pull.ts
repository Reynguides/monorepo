import type { Handler } from "hono";
import type { AuthVariables, Env } from "../../types/env.ts";
import { PullQuery } from "../../schemas/sync.ts";
import { fail } from "../../lib/errors.ts";
import { findDatabaseIdForUser } from "../../repo/user-databases.ts";
import { createUserDatabaseClient } from "../../user-data/factory.ts";
import { UserDatabaseClientError } from "../../user-data/types.ts";
import type { ClientEventOutput, PullResponse } from "../../sync/types.ts";

/**
 * GET /v1/sync/pull?since=<rowid>&limit=N
 *
 * Cursor-paginated, ordered by D1 rowid (monotonic per user's DB). The
 * server-wins reconciliation policy from ADR-0008 lives here: a fresh
 * desktop install pulls from `since=null` and replays the server's view.
 */
export const pullHandler: Handler<{ Bindings: Env; Variables: AuthVariables }> = async (c) => {
  const session = c.var.session;

  const parsed = PullQuery.safeParse({
    since: c.req.query("since"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { since, limit } = parsed.data;

  const dbId = await findDatabaseIdForUser(c.env.ACCOUNTS_DB, session.userId);
  if (!dbId) {
    return fail(c, 500, "user_database_missing");
  }

  let client;
  try {
    client = createUserDatabaseClient(c.env, dbId);
  } catch (e) {
    if (e instanceof UserDatabaseClientError) {
      return fail(c, 500, "server_misconfigured", e.message);
    }
    /* istanbul ignore next -- factory only throws UserDatabaseClientError. */
    throw e;
  }

  const page = await client.listEventsSince(session.userId, since, limit);
  const items: ClientEventOutput[] = page.items.map((r) => ({
    eventId: r.event_id,
    type: r.type,
    occurredAt: r.occurred_at,
    payloadJson: r.payload_json,
    contentHash: r.content_hash,
    receivedAt: r.received_at,
    cursor: r.rowid,
  }));
  const body: PullResponse = { items, nextCursor: page.nextCursor };
  return c.json(body, 200);
};
