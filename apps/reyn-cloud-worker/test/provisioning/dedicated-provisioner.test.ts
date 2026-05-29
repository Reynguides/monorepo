import { describe, expect, it, vi } from "vitest";
import {
  DedicatedProvisioner,
  type FetchLike,
} from "../../src/provisioning/DedicatedProvisioner.ts";
import { ProvisioningError } from "../../src/provisioning/types.ts";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function makeProvisioner(
  fetcher: FetchLike,
  initStatements: readonly string[] = ["CREATE TABLE t (x);"],
) {
  return new DedicatedProvisioner({
    apiToken: "test-token",
    accountId: "test-account",
    fetcher,
    initStatements,
  });
}

/**
 * Wrap a synchronous Response-producing handler as a FetchLike, since our
 * test fetchers don't actually do any async work — they're routing logic.
 */
function fakeFetcher(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response,
): FetchLike {
  return (input, init) => Promise.resolve(handler(input, init));
}

describe("DedicatedProvisioner", () => {
  it("creates a database then applies every init statement", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher = vi.fn<FetchLike>(
      fakeFetcher((input, init) => {
        const url = urlOf(input);
        calls.push({ url, init });
        if (url.endsWith("/d1/database") && init?.method === "POST") {
          return jsonResponse({
            success: true,
            result: { uuid: "new-uuid", created_in_region: "WEUR" },
          });
        }
        if (url.includes("/d1/database/new-uuid/query")) {
          return jsonResponse({ success: true });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const p = makeProvisioner(fetcher, ["CREATE TABLE a (x);", "CREATE INDEX i ON a(x);"]);
    const handle = await p.provision("user-1");

    expect(handle.databaseId).toBe("new-uuid");
    expect(handle.region).toBe("WEUR");
    expect(fetcher).toHaveBeenCalledTimes(3);

    const createCall = calls[0]!;
    expect(createCall.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/test-account/d1/database",
    );
    const createHeaders = createCall.init?.headers as Record<string, string>;
    expect(createHeaders.Authorization).toBe("Bearer test-token");
  });

  it("rolls back (DELETE) when a migration query fails", async () => {
    const seen: string[] = [];
    const fetcher = vi.fn<FetchLike>(
      fakeFetcher((input, init) => {
        const url = urlOf(input);
        seen.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/d1/database") && init?.method === "POST") {
          return jsonResponse({ success: true, result: { uuid: "orphan-uuid" } });
        }
        if (url.includes("/d1/database/orphan-uuid/query")) {
          return jsonResponse({ success: false, errors: [{ code: 1, message: "bad sql" }] });
        }
        if (url.endsWith("/d1/database/orphan-uuid") && init?.method === "DELETE") {
          return jsonResponse({ success: true });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const p = makeProvisioner(fetcher);
    await expect(p.provision("user-1")).rejects.toBeInstanceOf(ProvisioningError);

    expect(seen).toContain(
      "DELETE https://api.cloudflare.com/client/v4/accounts/test-account/d1/database/orphan-uuid",
    );
  });

  it("throws ProvisioningError when create returns a non-OK HTTP status", async () => {
    const fetcher = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ success: false }, { status: 401 })),
    );
    const p = makeProvisioner(fetcher);
    await expect(p.provision("user-1")).rejects.toThrow(/HTTP 401/);
  });

  it("throws ProvisioningError when create response has no uuid", async () => {
    const fetcher = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ success: true, result: {} })),
    );
    const p = makeProvisioner(fetcher);
    await expect(p.provision("user-1")).rejects.toThrow(/no uuid/);
  });

  it("throws ProvisioningError when a migration request returns non-OK HTTP", async () => {
    const fetcher = vi.fn<FetchLike>(
      fakeFetcher((input, init) => {
        const url = urlOf(input);
        if (url.endsWith("/d1/database") && init?.method === "POST") {
          return jsonResponse({ success: true, result: { uuid: "u" } });
        }
        if (url.includes("/d1/database/u/query")) {
          return jsonResponse({}, { status: 500 });
        }
        return jsonResponse({ success: true });
      }),
    );
    const p = makeProvisioner(fetcher, ["CREATE TABLE t (x);"]);
    await expect(p.provision("u-1")).rejects.toThrow(/Failed to apply user-D1 migrations/);
  });

  it("deprovision DELETEs the database and throws on non-OK", async () => {
    const fetcher = vi.fn<FetchLike>((_, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ success: false }, { status: 404 }));
      }
      throw new Error("unexpected");
    });
    const p = makeProvisioner(fetcher);
    await expect(p.deprovision({ databaseId: "x" })).rejects.toThrow(/HTTP 404/);
  });

  it("derives a sanitised D1 name from the userId", async () => {
    const seenBodies: string[] = [];
    const fetcher = vi.fn<FetchLike>(
      fakeFetcher((input, init) => {
        const url = urlOf(input);
        if (url.endsWith("/d1/database") && init?.method === "POST") {
          seenBodies.push(init?.body as string);
          return jsonResponse({ success: true, result: { uuid: "u" } });
        }
        return jsonResponse({ success: true });
      }),
    );
    const p = makeProvisioner(fetcher, ["CREATE TABLE t (x);"]);
    await p.provision("abc-def-ghi-jkl-mno-pqr-stu-vwx-yz0-123-456");
    expect(seenBodies[0]).toContain('"name":"reyn_user_abcdefghijklmnopqrstuvwx"');
  });
});
