import type { Context } from "hono";

/** Uniform error envelope. Mirrors apps/reyn-kb-worker/src/lib/errors.ts. */
export interface ApiError {
  error: string;
  message?: string;
  issues?: unknown;
}

/** Compact 4xx/5xx JSON helper. */
export function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502,
  error: string,
  message?: string,
  issues?: unknown,
): Response {
  const body: ApiError = { error };
  if (message !== undefined) body.message = message;
  if (issues !== undefined) body.issues = issues;
  return c.json(body, status);
}
