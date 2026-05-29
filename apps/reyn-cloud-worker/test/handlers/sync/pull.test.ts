import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "../../helpers/setup.ts";
import { call, register } from "../../helpers/client.ts";

function makeEvent(seed: string) {
  return {
    eventId: crypto.randomUUID(),
    type: "bg3.test",
    occurredAt: 1_700_000_000_000,
    payloadJson: `{"k":"${seed}"}`,
  };
}

async function push(token: string, events: ReturnType<typeof makeEvent>[]) {
  const res = await call("/v1/sync/push", { method: "POST", token, jsonBody: { events } });
  expect(res.status).toBe(200);
}

describe("GET /v1/sync/pull", () => {
  it("requires bearer auth", async () => {
    const res = await call("/v1/sync/pull");
    expect(res.status).toBe(401);
  });

  it("returns an empty page on a fresh account", async () => {
    const { body } = await register("pull-empty@example.com");
    const res = await call("/v1/sync/pull", { token: body.token! });
    expect(res.status).toBe(200);
    const responseBody: { items: unknown[]; nextCursor: number | null } = await res.json();
    expect(responseBody.items).toEqual([]);
    expect(responseBody.nextCursor).toBeNull();
  });

  it("returns inserted events with cursors", async () => {
    const { body } = await register("pull-some@example.com");
    await push(body.token!, [makeEvent("a"), makeEvent("b"), makeEvent("c")]);
    const res = await call("/v1/sync/pull", { token: body.token! });
    const responseBody: {
      items: { eventId: string; cursor: number; type: string }[];
      nextCursor: number | null;
    } = await res.json();
    expect(responseBody.items).toHaveLength(3);
    expect(responseBody.items[0]!.cursor).toBeLessThan(responseBody.items[2]!.cursor);
  });

  it("paginates with since= and reports nextCursor for next page", async () => {
    const { body } = await register("pull-paginate@example.com");
    await push(body.token!, [makeEvent("a"), makeEvent("b"), makeEvent("c")]);
    const page1Res = await call("/v1/sync/pull?limit=2", { token: body.token! });
    const page1: {
      items: { cursor: number }[];
      nextCursor: number | null;
    } = await page1Res.json();
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2Res = await call(`/v1/sync/pull?since=${page1.nextCursor}&limit=2`, {
      token: body.token!,
    });
    const page2: {
      items: { cursor: number }[];
      nextCursor: number | null;
    } = await page2Res.json();
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("returns 400 on invalid since (non-numeric)", async () => {
    const { body } = await register("pull-bad-since@example.com");
    const res = await call("/v1/sync/pull?since=not-a-number", { token: body.token! });
    expect(res.status).toBe(400);
  });

  it("returns 400 on limit > 500", async () => {
    const { body } = await register("pull-bad-limit@example.com");
    const res = await call("/v1/sync/pull?limit=999", { token: body.token! });
    expect(res.status).toBe(400);
  });

  it("filters out other users' rows", async () => {
    const a = await register("pull-isolation-a@example.com");
    const b = await register("pull-isolation-b@example.com");
    await push(a.body.token!, [makeEvent("a-only")]);
    await push(b.body.token!, [makeEvent("b-only")]);
    const res = await call("/v1/sync/pull", { token: a.body.token! });
    const responseBody: { items: { payloadJson: string }[] } = await res.json();
    expect(responseBody.items.map((i) => i.payloadJson)).toEqual([`{"k":"a-only"}`]);
  });

  it("returns 500 user_database_missing when no mapping exists", async () => {
    const { body } = await register("pull-no-db@example.com");
    await env.ACCOUNTS_DB.prepare("DELETE FROM user_databases WHERE user_id = ?")
      .bind(body.userId)
      .run();
    const res = await call("/v1/sync/pull", { token: body.token! });
    expect(res.status).toBe(500);
    const responseBody: { error: string } = await res.json();
    expect(responseBody.error).toBe("user_database_missing");
  });

  it("returns 500 server_misconfigured under dedicated mode without creds", async () => {
    const { body } = await register("pull-misconfig@example.com");
    const broken = { ...env, PROVISIONER: "dedicated" as const };
    const app = (await import("../../../src/index.ts")).default;
    const res = await app.fetch(
      new Request("http://t/v1/sync/pull", {
        headers: { Authorization: `Bearer ${body.token!}` },
      }),
      broken,
    );
    expect(res.status).toBe(500);
  });
});
