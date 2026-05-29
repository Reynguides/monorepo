import { describe, expect, it } from "vitest";
import "./helpers/setup.ts";
import { call, register } from "./helpers/client.ts";

describe("POST /v1/auth/logout", () => {
  it("revokes the session — subsequent /v1/me returns 401", async () => {
    const { body } = await register("logout@example.com");
    const token = body.token!;

    const meBefore = await call("/v1/me", { token });
    expect(meBefore.status).toBe(200);

    const logout = await call("/v1/auth/logout", { method: "POST", token });
    expect(logout.status).toBe(204);

    const meAfter = await call("/v1/me", { token });
    expect(meAfter.status).toBe(401);
  });

  it("returns 401 with no bearer header", async () => {
    const res = await call("/v1/auth/logout", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 401 with an unknown bearer token", async () => {
    const res = await call("/v1/auth/logout", { method: "POST", token: "not-a-real-token" });
    expect(res.status).toBe(401);
  });

  it("returns 401 with an empty bearer token (whitespace-only)", async () => {
    // Two spaces — the first matches "Bearer ", the second is the "token"
    // which trims to empty. A single trailing space would be HTTP-trimmed and
    // never reach the empty-token check.
    const res = await call("/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer  " },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with a non-Bearer scheme", async () => {
    const res = await call("/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: "Basic abc" },
    });
    expect(res.status).toBe(401);
  });
});
