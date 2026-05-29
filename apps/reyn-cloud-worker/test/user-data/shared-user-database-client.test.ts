import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "../helpers/setup.ts";
import { SharedUserDatabaseClient } from "../../src/user-data/SharedUserDatabaseClient.ts";
import type { ServerEventInsert } from "../../src/sync/types.ts";

function makeInsert(
  eventId: string,
  userId: string,
  contentHash: string,
  type = "bg3.t",
  occurredAt = 0,
): ServerEventInsert {
  return {
    event_id: eventId,
    user_id: userId,
    type,
    occurred_at: occurredAt,
    payload_json: "{}",
    content_hash: contentHash,
    received_at: 100,
  };
}

describe("SharedUserDatabaseClient", () => {
  let client: SharedUserDatabaseClient;
  beforeEach(async () => {
    client = new SharedUserDatabaseClient(env.USER_DATA_DB);
    // Clean slate per test — pool gives each worker its own DB, but multiple
    // tests in the same file share it.
    await env.USER_DATA_DB.prepare("DELETE FROM events").run();
    await env.USER_DATA_DB.prepare("DELETE FROM sync_idempotency").run();
  });

  it("inserts empty batch as 0", async () => {
    expect(await client.insertEvents([])).toBe(0);
  });

  it("INSERT OR IGNOREs duplicate content within a single batch", async () => {
    const userId = crypto.randomUUID();
    const a = makeInsert(crypto.randomUUID(), userId, "hash-a");
    const b = makeInsert(crypto.randomUUID(), userId, "hash-a"); // dupe content hash
    expect(await client.insertEvents([a, b])).toBe(1);
  });

  it("dedups across batches via UNIQUE(user_id, content_hash)", async () => {
    const userId = crypto.randomUUID();
    const a = makeInsert(crypto.randomUUID(), userId, "hash-x");
    await client.insertEvents([a]);
    const a2 = makeInsert(crypto.randomUUID(), userId, "hash-x");
    expect(await client.insertEvents([a2])).toBe(0);
  });

  it("paginates listEventsSince and signals end with nextCursor=null", async () => {
    const userId = crypto.randomUUID();
    for (let i = 0; i < 3; i++) {
      await client.insertEvents([makeInsert(crypto.randomUUID(), userId, `h${i}`)]);
    }
    const page1 = await client.listEventsSince(userId, null, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await client.listEventsSince(userId, page1.nextCursor, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("excludes other users' rows in listEventsSince", async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    await client.insertEvents([
      makeInsert(crypto.randomUUID(), userA, "ha"),
      makeInsert(crypto.randomUUID(), userB, "hb"),
    ]);
    const page = await client.listEventsSince(userA, null, 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.user_id).toBe(userA);
  });

  it("caches idempotent response and reads it back", async () => {
    const userId = crypto.randomUUID();
    expect(await client.findIdempotentResponse(userId, "k")).toBeNull();
    await client.recordIdempotentResponse(userId, "k", '{"r":1}', 1);
    expect(await client.findIdempotentResponse(userId, "k")).toBe('{"r":1}');
  });

  it("second recordIdempotentResponse with same key is a no-op", async () => {
    const userId = crypto.randomUUID();
    await client.recordIdempotentResponse(userId, "k", '{"r":1}', 1);
    await client.recordIdempotentResponse(userId, "k", '{"r":99}', 2);
    expect(await client.findIdempotentResponse(userId, "k")).toBe('{"r":1}');
  });
});
