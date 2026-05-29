import { env } from "cloudflare:test";
import app from "../../src/index.ts";

interface CallInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  token?: string;
  jsonBody?: unknown;
}

/**
 * Posts JSON to the in-process Hono app. Bypasses real HTTP — uses Hono's
 * fetch handler directly with the test env bindings.
 */
export async function call(path: string, init: CallInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token !== undefined) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }
  let body: BodyInit | null = init.body ?? null;
  if (init.jsonBody !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.jsonBody);
  }
  const req = new Request(`http://test.local${path}`, {
    method: init.method ?? "GET",
    headers,
    body,
  });
  return await app.fetch(req, env);
}

export async function register(email: string, password = "Hunter2longenough!") {
  const res = await call("/v1/auth/register", {
    method: "POST",
    jsonBody: { email, password },
  });
  const body: { userId?: string; token?: string; expiresAt?: string } = await res.json();
  return { res, body };
}
