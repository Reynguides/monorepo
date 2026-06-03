import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index.ts";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

const WRITE_ENDPOINTS = ["/v1/kb/sources", "/v1/kb/pages", "/v1/kb/images"] as const;

describe("ingest-key auth on KB write endpoints (ADR-0014)", () => {
  it("rejects writes with no bearer key (401)", async () => {
    for (const path of WRITE_ENDPOINTS) {
      const res = await call(path, { method: "POST", jsonBody: {} });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: "unauthorized" });
    }
  });

  it("rejects writes with a wrong bearer key (401)", async () => {
    for (const path of WRITE_ENDPOINTS) {
      const res = await call(path, {
        method: "POST",
        headers: { Authorization: "Bearer wrong-key" },
        jsonBody: {},
      });
      expect(res.status).toBe(401);
    }
  });

  it("rejects a non-bearer Authorization scheme (401)", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
      jsonBody: {},
    });
    expect(res.status).toBe(401);
  });

  it("returns 500 server_misconfigured when KB_INGEST_KEY is unset", async () => {
    // Build an env without the ingest key; routes through the real middleware.
    const { KB_INGEST_KEY: _omit, ...rest } = env;
    const req = new Request("http://test.local/v1/kb/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await app.fetch(req, rest);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "server_misconfigured" });
  });

  it("allows reads without any auth", async () => {
    const res = await call("/v1/kb/pages?source=any");
    // No source rows → empty list, but crucially NOT a 401.
    expect(res.status).toBe(200);
  });
});
