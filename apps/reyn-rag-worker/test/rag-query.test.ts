import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index.ts";
import { MOCK_LLM_MARKER } from "../src/llm/MockLlmProvider.ts";
import {
  buildPrompt,
  computeScores,
  dedupeCitations,
  kbSearchFailDetail,
} from "../src/handlers/rag/query.ts";
import { KbSearchError, type KbSearchResult } from "../src/kb-search/types.ts";

interface RagBody {
  answer: string;
  citations: { url: string; sourceTier: number | null; chunkId: string }[];
  scores: { relevance: number; confidence: number; freshness: number };
  error?: string;
}

/** Read a response body as the RagBody shape (Hono infers a wide union; narrow once). */
async function bodyOf(res: { json(): Promise<unknown> }): Promise<RagBody> {
  const raw: unknown = await res.json();
  return raw as RagBody;
}

function post(body: unknown, overrides: Record<string, unknown> = {}) {
  return app.request(
    "/v1/rag/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { ...env, ...overrides },
  );
}

function result(overrides: Partial<KbSearchResult>): KbSearchResult {
  return {
    chunkId: "p:0",
    pageId: "p",
    url: "https://bg3.wiki/wiki/Page",
    title: "Page",
    headingPath: null,
    pageType: "article",
    sourceTier: 1,
    snippet: "text",
    scores: { semantic: 0.8, keyword: null, fused: 0.02, tier: 0.05, freshness: 0.5 },
    via: "primary",
    ...overrides,
  };
}

describe("POST /v1/rag/query", () => {
  it("returns a grounded mock answer with deduped citations and scores", async () => {
    const res = await post({ question: "Who is Shadowheart?" });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.answer).toContain(MOCK_LLM_MARKER);
    expect(body.citations).toHaveLength(2);
    expect(body.citations[0]!.url).toBe("https://bg3.wiki/wiki/Shadowheart");
    expect(body.scores.relevance).toBeCloseTo((0.82 + 0.61) / 2);
    expect(body.scores.confidence).toBe(1);
    expect(body.scores.freshness).toBeCloseTo(0.9);
  });

  it("accepts an optional topK and filters", async () => {
    const res = await post({
      question: "Which spells does Gale know?",
      topK: 8,
      filters: { pageTypes: ["spell"], tiersMax: 1 },
    });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.citations.length).toBeGreaterThan(0);
  });

  it("returns 400 on a body missing the question", async () => {
    const res = await post({ notQuestion: "x" });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe("validation_failed");
  });

  it("returns 400 on a non-JSON body", async () => {
    const res = await app.request(
      "/v1/rag/query",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns the no-context answer with zeroed scores when retrieval is empty", async () => {
    const res = await post({ question: "noresults for this query" });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.answer).toBe("I don't have any relevant indexed context to answer that question.");
    expect(body.citations).toEqual([]);
    expect(body.scores).toEqual({ relevance: 0, confidence: 0, freshness: 0 });
  });

  it("returns 502 when KB search fails", async () => {
    const res = await post({ question: "searchfail please" });
    expect(res.status).toBe(502);
    expect((await bodyOf(res)).error).toBe("kb_search_failed");
  });
});

describe("dedupeCitations", () => {
  it("keeps one citation per chunk id, in order", () => {
    const citations = dedupeCitations([
      result({ chunkId: "a", url: "https://x/a" }),
      result({ chunkId: "a", url: "https://x/a" }),
      result({ chunkId: "b", url: "https://x/b" }),
    ]);
    expect(citations.map((ct) => ct.chunkId)).toEqual(["a", "b"]);
  });
});

describe("computeScores", () => {
  it("ignores null semantic scores and takes the max freshness", () => {
    const scores = computeScores([
      result({ scores: { semantic: 0.9, keyword: null, fused: 0, tier: 0, freshness: 0.4 } }),
      result({ scores: { semantic: null, keyword: 0.2, fused: 0, tier: 0, freshness: 0.95 } }),
    ]);
    expect(scores.relevance).toBeCloseTo(0.9);
    expect(scores.confidence).toBe(1);
    expect(scores.freshness).toBeCloseTo(0.95);
  });
});

describe("kbSearchFailDetail", () => {
  it("uses the KbSearchError message", () => {
    expect(kbSearchFailDetail(new KbSearchError("boom"))).toBe("boom");
  });

  it("falls back for a non-KbSearchError", () => {
    expect(kbSearchFailDetail(new Error("other"))).toBe("kb search failed");
    expect(kbSearchFailDetail("nope")).toBe("kb search failed");
  });
});

describe("buildPrompt", () => {
  it("embeds the context and question", () => {
    const p = buildPrompt("CTX", "Q?");
    expect(p).toContain("CTX");
    expect(p).toContain("Q?");
  });
});
