import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, register } from "./helpers/client.ts";

describe("GET /v1/me", () => {
  it("returns the authenticated user", async () => {
    const { body } = await register("me@example.com");
    const res = await call("/v1/me", { token: body.token! });
    expect(res.status).toBe(200);
    const me: { userId: string; email: string } = await res.json();
    expect(me.userId).toBe(body.userId);
    expect(me.email).toBe("me@example.com");
  });

  it("returns 401 when the underlying user row has been deleted", async () => {
    const { body } = await register("ghost@example.com");
    // FK cascade would normally drop the session along with the user. We
    // disable FK enforcement so the session keeps pointing at a now-missing
    // user — that hits me-handler's `!user` branch (not the middleware's).
    await env.ACCOUNTS_DB.prepare("PRAGMA foreign_keys = OFF").run();
    await env.ACCOUNTS_DB.prepare("DELETE FROM users WHERE id = ?").bind(body.userId).run();
    await env.ACCOUNTS_DB.prepare("PRAGMA foreign_keys = ON").run();
    const res = await call("/v1/me", { token: body.token! });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the session is expired", async () => {
    const { body } = await register("expired@example.com");
    await env.ACCOUNTS_DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .bind(1, body.userId)
      .run();
    const res = await call("/v1/me", { token: body.token! });
    expect(res.status).toBe(401);
  });
});
