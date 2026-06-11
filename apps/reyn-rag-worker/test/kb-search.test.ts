import { describe, expect, it, vi } from "vitest";
import { createKbSearchClient } from "../src/kb-search/factory.ts";
import { MockKbSearchClient, MOCK_KB_RESULTS } from "../src/kb-search/MockKbSearchClient.ts";
import { HttpKbSearchClient } from "../src/kb-search/HttpKbSearchClient.ts";
import { KbSearchError } from "../src/kb-search/types.ts";
import type { Env } from "../src/types/env.ts";

function baseEnv(overrides: Partial<Env>): Env {
  return { KB_SEARCH: "mock", LLM_PROVIDER: "mock", ...overrides };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}

const oneResultBody = {
  query: "q",
  mode: "hybrid",
  results: [
    {
      chunkId: "p1:0",
      pageId: "p1",
      url: "https://bg3.wiki/wiki/Gale",
      title: "Gale",
      headingPath: "Gale > Class",
      pageType: "creature",
      sourceTier: 1,
      snippet: "Gale is a human wizard.",
      scores: { semantic: 0.7, keyword: 0.3, fused: 0.02, tier: 0.05, freshness: 0.9 },
      via: "primary",
    },
  ],
};

describe("createKbSearchClient", () => {
  it("returns the mock client when KB_SEARCH=mock", () => {
    expect(createKbSearchClient(baseEnv({ KB_SEARCH: "mock" }))).toBeInstanceOf(MockKbSearchClient);
  });

  it("returns the http client when KB_SEARCH=http and KB_BASE_URL is set", () => {
    const client = createKbSearchClient(
      baseEnv({ KB_SEARCH: "http", KB_BASE_URL: "https://kb.example.dev" }),
    );
    expect(client).toBeInstanceOf(HttpKbSearchClient);
  });

  it("throws when KB_SEARCH=http without KB_BASE_URL", () => {
    expect(() => createKbSearchClient(baseEnv({ KB_SEARCH: "http" }))).toThrow(KbSearchError);
  });
});

describe("MockKbSearchClient", () => {
  it("returns canned results for a normal query", async () => {
    const results = await new MockKbSearchClient().search({ query: "Who is Gale?" });
    expect(results).toEqual(MOCK_KB_RESULTS);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns no results for a query signalling the empty path", async () => {
    const results = await new MockKbSearchClient().search({ query: "noresults please" });
    expect(results).toEqual([]);
  });

  it("rejects with KbSearchError for the failure sentinel query", async () => {
    await expect(
      new MockKbSearchClient().search({ query: "searchfail now" }),
    ).rejects.toBeInstanceOf(KbSearchError);
  });
});

describe("HttpKbSearchClient", () => {
  function makeClient(fetcher: typeof fetch, baseUrl = "https://kb.example.dev") {
    return new HttpKbSearchClient({ baseUrl, fetcher });
  }

  it("POSTs to {baseUrl}/v1/kb/search and returns parsed results", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(oneResultBody));
    const results = await makeClient(fetcher).search({ query: "q", topK: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://bg3.wiki/wiki/Gale");
    expect(results[0]!.scores.semantic).toBe(0.7);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://kb.example.dev/v1/kb/search");
    const body = JSON.parse((init as RequestInit).body as string) as {
      query: string;
      topK: number;
      mode: string;
    };
    expect(body.query).toBe("q");
    expect(body.topK).toBe(5);
    expect(body.mode).toBe("hybrid");
  });

  it("forwards filters when supplied", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(oneResultBody));
    await makeClient(fetcher).search({
      query: "q",
      filters: { pageTypes: ["spell"], tiersMax: 1 },
    });
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as {
      filters?: { pageTypes?: string[]; tiersMax?: number };
    };
    expect(body.filters).toEqual({ pageTypes: ["spell"], tiersMax: 1 });
  });

  it("omits filters and topK from the body when not supplied", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(oneResultBody));
    await makeClient(fetcher).search({ query: "q" });
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("filters");
    expect(body).not.toHaveProperty("topK");
  });

  it("strips a trailing slash on the base URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(oneResultBody));
    await makeClient(fetcher, "https://kb.example.dev/").search({ query: "q" });
    expect(fetcher.mock.calls[0]![0]).toBe("https://kb.example.dev/v1/kb/search");
  });

  it("throws KbSearchError on HTTP non-2xx", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(makeClient(fetcher).search({ query: "q" })).rejects.toBeInstanceOf(KbSearchError);
  });

  it("throws KbSearchError on an invalid response body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ query: "q", results: "not-an-array" }));
    await expect(makeClient(fetcher).search({ query: "q" })).rejects.toBeInstanceOf(KbSearchError);
  });

  it("uses the global fetch when no fetcher is supplied", () => {
    expect(new HttpKbSearchClient({ baseUrl: "https://kb.example.dev" })).toBeInstanceOf(
      HttpKbSearchClient,
    );
  });
});
