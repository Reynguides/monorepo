import { describe, expect, it } from "vitest";
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
    const { res } = await register("dup@example.com");
    expect(res.status).toBe(409);
    const body: { error: string } = await res.clone().json();
    expect(body.error).toBe("email_already_exists");
  });

  it("returns 400 when password is too short", async () => {
    const res = await call("/v1/auth/register", {
      method: "POST",
      jsonBody: { email: "short-pw@example.com", password: "short" },
    });
    expect(res.status).toBe(400);
  });
});
