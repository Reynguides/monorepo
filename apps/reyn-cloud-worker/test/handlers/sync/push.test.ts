import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "../../helpers/setup.ts";
import { call, register } from "../../helpers/client.ts";

function makeEvent(seed: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: crypto.randomUUID(),
    type: "bg3.test",
    occurredAt: 1_700_000_000_000,
    payloadJson: `{"k":"${seed}"}`,
    ...overrides,
  };
}

describe("POST /v1/sync/push", () => {
  it("requires bearer auth", async () => {
    const res = await call("/v1/sync/push", {
      method: "POST",
      jsonBody: { events: [makeEvent("a")] },
    });
    expect(res.status).toBe(401);
  });

  it("inserts a fresh batch and returns accepted=N, duplicates=0", async () => {
    const { body } = await register("push-fresh@example.com");
    const events = [makeEvent("a"), makeEvent("b"), makeEvent("c")];
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events },
    });
    expect(res.status).toBe(200);
    const responseBody: { accepted: number; duplicates: number } = await res.json();
    expect(responseBody).toEqual({ accepted: 3, duplicates: 0 });
  });

  it("dedupes identical content within a single batch", async () => {
    const { body } = await register("push-batchdup@example.com");
    const fixed = makeEvent("x");
    const dup = { ...makeEvent("x"), eventId: crypto.randomUUID() }; // same payload, different uuid
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events: [fixed, dup] },
    });
    const responseBody: { accepted: number; duplicates: number } = await res.json();
    expect(responseBody).toEqual({ accepted: 1, duplicates: 1 });
  });

  it("dedupes across batches (content_hash uniqueness)", async () => {
    const { body } = await register("push-acrossdup@example.com");
    const ev = makeEvent("y");
    const first = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events: [ev] },
    });
    const firstResult: { accepted: number } = await first.json();
    expect(firstResult.accepted).toBe(1);

    const second = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events: [{ ...ev, eventId: crypto.randomUUID() }] },
    });
    const secondBody: { accepted: number; duplicates: number } = await second.json();
    expect(secondBody).toEqual({ accepted: 0, duplicates: 1 });
  });

  it("returns 400 on validation failure (empty array)", async () => {
    const { body } = await register("push-empty@example.com");
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events: [] },
    });
    expect(res.status).toBe(400);
    const responseBody: { error: string } = await res.json();
    expect(responseBody.error).toBe("validation_failed");
  });

  it("returns 400 on invalid JSON body", async () => {
    const { body } = await register("push-bad-json@example.com");
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("caches the response under Idempotency-Key and replays it verbatim", async () => {
    const { body } = await register("push-idem@example.com");
    const ev = makeEvent("idem-payload");
    const headers = { "Idempotency-Key": "batch-001" };

    const first = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      headers,
      jsonBody: { events: [ev] },
    });
    const firstBody: { accepted: number; duplicates: number } = await first.json();
    expect(firstBody).toEqual({ accepted: 1, duplicates: 0 });

    // Replay with the *same* key and a *different* event payload â€” the cached
    // response wins so the new event is not inserted.
    const second = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      headers,
      jsonBody: { events: [makeEvent("would-be-new")] },
    });
    const secondBody: { accepted: number; duplicates: number } = await second.json();
    expect(secondBody).toEqual(firstBody);
  });

  it("rejects malformed Idempotency-Key", async () => {
    const { body } = await register("push-bad-idem@example.com");
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      headers: { "Idempotency-Key": "spaces are illegal" },
      jsonBody: { events: [makeEvent("a")] },
    });
    expect(res.status).toBe(400);
    const responseBody: { error: string } = await res.json();
    expect(responseBody.error).toBe("invalid_idempotency_key");
  });

  it("returns 500 user_database_missing when the user has no mapping", async () => {
    const { body } = await register("push-no-db@example.com");
    await env.ACCOUNTS_DB.prepare("DELETE FROM user_databases WHERE user_id = ?")
      .bind(body.userId)
      .run();
    const res = await call("/v1/sync/push", {
      method: "POST",
      token: body.token!,
      jsonBody: { events: [makeEvent("a")] },
    });
    expect(res.status).toBe(500);
    const responseBody: { error: string } = await res.json();
    expect(responseBody.error).toBe("user_database_missing");
  });

  it("returns 500 server_misconfigured when PROVISIONER=dedicated lacks creds", async () => {
    const { body } = await register("push-misconfig@example.com");
    const broken = { ...env, PROVISIONER: "dedicated" as const };
    const app = (await import("../../../src/index.ts")).default;
    const res = await app.fetch(
      new Request("http://t/v1/sync/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${body.token!}`,
        },
        body: JSON.stringify({ events: [makeEvent("a")] }),
      }),
      broken,
    );
    expect(res.status).toBe(500);
    const responseBody: { error: string } = await res.json();
    expect(responseBody.error).toBe("server_misconfigured");
  });
});
