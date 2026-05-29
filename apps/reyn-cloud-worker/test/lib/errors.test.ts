import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { fail } from "../../src/lib/errors.ts";

describe("fail()", () => {
  it("returns the requested status with error, message, issues", async () => {
    const app = new Hono();
    app.get("/x", (c) => fail(c, 400, "bad", "details", [{ path: ["a"] }]));
    const res = await app.fetch(new Request("http://t/x"));
    expect(res.status).toBe(400);
    const body: { error: string; message: string; issues: unknown } = await res.json();
    expect(body.error).toBe("bad");
    expect(body.message).toBe("details");
    expect(body.issues).toEqual([{ path: ["a"] }]);
  });

  it("omits optional fields when not supplied", async () => {
    const app = new Hono();
    app.get("/x", (c) => fail(c, 401, "unauthorized"));
    const res = await app.fetch(new Request("http://t/x"));
    const body: Record<string, unknown> = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
  });
});
