import { describe, it, expect } from "vitest";
import app from "../src/index.ts";

interface HealthBody {
  ok: boolean;
  time: string;
}

describe("GET /v1/health", () => {
  it("returns ok:true with an ISO timestamp", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    const raw: unknown = await res.json();
    const body = raw as HealthBody;
    expect(body.ok).toBe(true);
    expect(typeof body.time).toBe("string");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
