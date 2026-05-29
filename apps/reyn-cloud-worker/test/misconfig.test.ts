import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import app from "../src/index.ts";

/**
 * Verifies the "SESSION_PEPPER missing" branch — the failure path expected
 * by ADR-0006 and the Phase 3 verification checklist.
 */
describe("missing SESSION_PEPPER", () => {
  it("register responds 500", async () => {
    const noPepperEnv = { ...env, SESSION_PEPPER: "" };
    const res = await app.fetch(
      new Request("http://t/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "no-pepper@example.com", password: "Hunter2longenough!" }),
      }),
      noPepperEnv,
    );
    expect(res.status).toBe(500);
    const body: { error: string } = await res.json();
    expect(body.error).toBe("server_misconfigured");
  });

  it("login responds 500", async () => {
    const noPepperEnv = { ...env, SESSION_PEPPER: "" };
    const res = await app.fetch(
      new Request("http://t/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@y.io", password: "Hunter2longenough!" }),
      }),
      noPepperEnv,
    );
    expect(res.status).toBe(500);
  });

  it("requireAuth middleware responds 500 on protected routes", async () => {
    const noPepperEnv = { ...env, SESSION_PEPPER: "" };
    const res = await app.fetch(
      new Request("http://t/v1/me", {
        headers: { Authorization: "Bearer some-token" },
      }),
      noPepperEnv,
    );
    expect(res.status).toBe(500);
  });
});
