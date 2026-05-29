import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, register } from "./helpers/client.ts";

describe("POST /v1/auth/register", () => {
  it("creates a new user and returns 201 + token", async () => {
    const { res, body } = await register("ok-user@example.com");
    expect(res.status).toBe(201);
    expect(typeof body.userId).toBe("string");
    expect(typeof body.token).toBe("string");
    expect(body.token!.length).toBeGreaterThan(20);
    expect(() => new Date(body.expiresAt!).toISOString()).not.toThrow();

    // Per Phase 4: a user_databases row should be recorded.
    const row = await env.ACCOUNTS_DB.prepare(
      "SELECT database_id, region FROM user_databases WHERE user_id = ?",
    )
      .bind(body.userId)
      .first<{ database_id: string; region: string | null }>();
    expect(row).not.toBeNull();
    expect(row!.database_id).toBe(env.SHARED_USER_DB_ID);
    expect(row!.region).toBe("SHARED");
  });

  it("returns 400 on validation failure (missing password)", async () => {
    const res = await call("/v1/auth/register", {
      method: "POST",
      jsonBody: { email: "x@y.io" },
    });
    expect(res.status).toBe(400);
    const body: { error: string; issues: unknown } = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.issues).toBeDefined();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await call("/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when the email already exists", async () => {
    await register("dup@example.com");
    const res = await call("/v1/auth/register", {
      method: "POST",
      jsonBody: { email: "dup@example.com", password: "Hunter2longenough!" },
    });
    expect(res.status).toBe(409);
    const body: { error: string } = await res.json();
    expect(body.error).toBe("email_already_exists");
  });

  it("returns 400 when password is too short", async () => {
    const res = await call("/v1/auth/register", {
      method: "POST",
      jsonBody: { email: "short-pw@example.com", password: "short" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 server_misconfigured when PROVISIONER=dedicated lacks CF_API_TOKEN", async () => {
    // Construct an env with dedicated mode but no CF_API_TOKEN/CF_ACCOUNT_ID
    // — the factory should fail-fast and the handler should surface 500.
    const noCreds = { ...env, PROVISIONER: "dedicated" as const };
    const app = (await import("../src/index.ts")).default;
    const res = await app.fetch(
      new Request("http://t/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "no-creds@example.com", password: "Hunter2longenough!" }),
      }),
      noCreds,
    );
    expect(res.status).toBe(500);
    const body: { error: string } = await res.json();
    expect(body.error).toBe("server_misconfigured");
  });
});
