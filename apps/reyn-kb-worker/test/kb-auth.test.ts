import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import app from "../src/index.ts";
import { call } from "./helpers/client.ts";

const KEY = "test-ingest-key";
const body = { id: "s-auth", name: "S", baseUrl: "https://x.example", tier: 1 };

describe("ingest-key auth (ADR-0017)", () => {
  it("rejects writes with no Authorization header (401)", async () => {
    const res = await call("/v1/kb/sources", { method: "POST", jsonBody: body });
    expect(res.status).toBe(401);
  });

  it("rejects a non-Bearer scheme (401)", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: { Authorization: "Basic abc" },
      jsonBody: body,
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer key (401)", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
      jsonBody: body,
    });
    expect(res.status).toBe(401);
  });

  it("accepts the correct bearer key (200)", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      jsonBody: body,
    });
    expect(res.status).toBe(200);
  });

  it("returns 500 server_misconfigured when KB_INGEST_KEY is unset", async () => {
    const req = new Request("http://test.local/v1/kb/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const res = await app.fetch(req, { ...env, KB_INGEST_KEY: undefined });
    expect(res.status).toBe(500);
  });

  it("leaves reads open (no auth needed)", async () => {
    const res = await call("/v1/kb/pages?source=none");
    expect(res.status).toBe(200);
  });
});
