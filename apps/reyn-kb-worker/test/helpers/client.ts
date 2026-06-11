import { env } from "cloudflare:test";
import app from "../../src/index.ts";

interface CallInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  jsonBody?: unknown;
}

/**
 * Calls the in-process Hono app. Bypasses real HTTP — uses Hono's fetch
 * handler directly with the test env bindings.
 */
export async function call(path: string, init: CallInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
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

/**
 * Reads a JSON response body as `T`. `Response.json()` is typed `unknown`; the
 * explicit `unknown` annotation keeps the assertion necessary (so
 * no-unnecessary-type-assertion is satisfied) while giving callers a typed value.
 */
export async function readJson<T>(res: Response): Promise<T> {
  const raw: unknown = await res.json();
  return raw as T;
}
