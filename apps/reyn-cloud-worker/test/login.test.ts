import { describe, expect, it } from "vitest";
import "./helpers/setup.ts";
import { call, register } from "./helpers/client.ts";

describe("POST /v1/auth/login", () => {
  it("returns 200 + token on correct credentials", async () => {
    await register("login-ok@example.com", "Hunter2longenough!");
    const res = await call("/v1/auth/login", {
      method: "POST",
      jsonBody: { email: "login-ok@example.com", password: "Hunter2longenough!" },
    });
    expect(res.status).toBe(200);
    const body: { userId: string; token: string } = await res.json();
    expect(body.userId).toMatch(/[0-9a-f-]{36}/);
    expect(body.token.length).toBeGreaterThan(20);
  });

  it("returns 401 when the password is wrong", async () => {
    await register("login-badpw@example.com", "Hunter2longenough!");
    const res = await call("/v1/auth/login", {
      method: "POST",
      jsonBody: { email: "login-badpw@example.com", password: "WrongPassword99!" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the user does not exist", async () => {
    const res = await call("/v1/auth/login", {
      method: "POST",
      jsonBody: { email: "nope@example.com", password: "Hunter2longenough!" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure", async () => {
    const res = await call("/v1/auth/login", {
      method: "POST",
      jsonBody: { email: "not-an-email", password: "x" },
    });
    expect(res.status).toBe(400);
  });
});
