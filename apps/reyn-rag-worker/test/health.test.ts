import { describe, expect, it } from "vitest";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

describe("GET /v1/health", () => {
  it("returns 200 with ok:true and an ISO timestamp", async () => {
    const res = await call("/v1/health");
    expect(res.status).toBe(200);
    const body: { ok: boolean; time: string } = await res.json();
    expect(body.ok).toBe(true);
    expect(() => new Date(body.time).toISOString()).not.toThrow();
  });
});
