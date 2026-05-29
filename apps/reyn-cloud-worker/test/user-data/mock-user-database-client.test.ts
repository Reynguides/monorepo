import { describe, expect, it } from "vitest";
import { MockUserDatabaseClient } from "../../src/user-data/MockUserDatabaseClient.ts";
import type { ServerEventInsert } from "../../src/sync/types.ts";

function makeInsert(eventId: string, userId: string, contentHash: string): ServerEventInsert {
  return {
    event_id: eventId,
    user_id: userId,
    type: "bg3.test",
    occurred_at: 0,
    payload_json: "{}",
    content_hash: contentHash,
    received_at: 0,
  };
}

describe("MockUserDatabaseClient", () => {
  it("returns 0 on empty insert", async () => {
    const c = new MockUserDatabaseClient();
    expect(await c.insertEvents([])).toBe(0);
  });

  it("inserts new rows and ignores per-user content-hash collisions", async () => {
    const c = new MockUserDatabaseClient();
    const inserted = await c.insertEvents([
      makeInsert("e1", "u1", "h1"),
      makeInsert("e2", "u1", "h2"),
      makeInsert("e3", "u1", "h1"), // dupe by (u1, h1)
      makeInsert("e4", "u2", "h1"), // different user, OK
    ]);
    expect(inserted).toBe(3);
  });

  it("paginates listEventsSince by rowid", async () => {
    const c = new MockUserDatabaseClient();
    for (let i = 0; i < 5; i++) {
      await c.insertEvents([makeInsert(`e${i}`, "u1", `h${i}`)]);
    }
    const page1 = await c.listEventsSince("u1", null, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await c.listEventsSince("u1", page1.nextCursor, 2);
    expect(page2.items).toHaveLength(2);

    const page3 = await c.listEventsSince("u1", page2.nextCursor, 2);
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });

  it("filters listEventsSince by user", async () => {
    const c = new MockUserDatabaseClient();
    await c.insertEvents([makeInsert("a", "u1", "ha"), makeInsert("b", "u2", "hb")]);
    const page = await c.listEventsSince("u1", null, 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.event_id).toBe("a");
  });

  it("caches the first idempotent response and ignores second writes", async () => {
    const c = new MockUserDatabaseClient();
    expect(await c.findIdempotentResponse("u1", "k")).toBeNull();
    await c.recordIdempotentResponse("u1", "k", '{"a":1}', 1);
    await c.recordIdempotentResponse("u1", "k", '{"a":2}', 2);
    expect(await c.findIdempotentResponse("u1", "k")).toBe('{"a":1}');
  });
});
