import { describe, expect, it, vi } from "vitest";
import {
  RestUserDatabaseClient,
  type RestUserDatabaseClientOptions,
} from "../../src/user-data/RestUserDatabaseClient.ts";
import { UserDatabaseClientError } from "../../src/user-data/types.ts";
import type { ServerEventInsert, ServerEventRow } from "../../src/sync/types.ts";

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const opts: RestUserDatabaseClientOptions = {
    apiToken: "tok",
    accountId: "acct",
    databaseId: "db-uuid",
    fetcher,
  };
  return new RestUserDatabaseClient(opts);
}

function insertRow(): ServerEventInsert {
  return {
    event_id: "e1",
    user_id: "u1",
    type: "t",
    occurred_at: 0,
    payload_json: "{}",
    content_hash: "h",
    received_at: 0,
  };
}

describe("RestUserDatabaseClient", () => {
  it("returns 0 on empty insert without hitting the API", async () => {
    const fetcher = vi.fn();
    const client = makeClient(fetcher);
    expect(await client.insertEvents([])).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sums changes across per-event REST calls", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ success: true, result: [{ meta: { changes: 1 } }] })),
      );
    const client = makeClient(fetcher);
    const inserted = await client.insertEvents([insertRow(), { ...insertRow(), event_id: "e2" }]);
    expect(inserted).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats missing changes meta as 0", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ success: true, result: [{}] }));
    const client = makeClient(fetcher);
    expect(await client.insertEvents([insertRow()])).toBe(0);
  });

  it("throws on HTTP non-2xx", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
    const client = makeClient(fetcher);
    await expect(client.insertEvents([insertRow()])).rejects.toBeInstanceOf(
      UserDatabaseClientError,
    );
  });

  it("throws on success:false body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, errors: [{ code: 1, message: "bad" }] }));
    const client = makeClient(fetcher);
    await expect(client.insertEvents([insertRow()])).rejects.toBeInstanceOf(
      UserDatabaseClientError,
    );
  });

  it("treats missing errors array as empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    const client = makeClient(fetcher);
    await expect(client.insertEvents([insertRow()])).rejects.toBeInstanceOf(
      UserDatabaseClientError,
    );
  });

  it("listEventsSince maps results and computes nextCursor", async () => {
    const rows: ServerEventRow[] = [
      {
        rowid: 1,
        event_id: "e1",
        user_id: "u1",
        type: "t",
        occurred_at: 1,
        payload_json: "{}",
        content_hash: "h1",
        received_at: 1,
      },
      {
        rowid: 2,
        event_id: "e2",
        user_id: "u1",
        type: "t",
        occurred_at: 2,
        payload_json: "{}",
        content_hash: "h2",
        received_at: 2,
      },
    ];
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, result: [{ results: rows }] }));
    const client = makeClient(fetcher);
    const page = await client.listEventsSince("u1", null, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(2);
  });

  it("listEventsSince returns nextCursor=null when fewer rows than limit", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, result: [{ results: [] }] }));
    const client = makeClient(fetcher);
    const page = await client.listEventsSince("u1", 5, 100);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it("listEventsSince treats missing results as empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ success: true, result: [{}] }));
    const client = makeClient(fetcher);
    const page = await client.listEventsSince("u1", null, 10);
    expect(page.items).toHaveLength(0);
  });

  it("findIdempotentResponse returns the cached string", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        result: [{ results: [{ response_json: '{"a":1}' }] }],
      }),
    );
    const client = makeClient(fetcher);
    expect(await client.findIdempotentResponse("u", "k")).toBe('{"a":1}');
  });

  it("findIdempotentResponse returns null on no row", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, result: [{ results: [] }] }));
    const client = makeClient(fetcher);
    expect(await client.findIdempotentResponse("u", "k")).toBeNull();
  });

  it("recordIdempotentResponse posts an INSERT OR IGNORE", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, result: [{ meta: { changes: 1 } }] }));
    const client = makeClient(fetcher);
    await client.recordIdempotentResponse("u", "k", '{"ok":true}', 99);
    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as { sql: string; params: unknown[] };
    expect(body.sql).toMatch(/INSERT OR IGNORE INTO sync_idempotency/);
    expect(body.params).toEqual(["u", "k", '{"ok":true}', 99]);
  });

  it("uses the global fetch when no fetcher is supplied", () => {
    const client = new RestUserDatabaseClient({
      apiToken: "t",
      accountId: "a",
      databaseId: "d",
    });
    expect(client).toBeInstanceOf(RestUserDatabaseClient);
  });
});
