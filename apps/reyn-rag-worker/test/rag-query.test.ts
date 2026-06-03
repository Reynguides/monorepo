import { beforeEach, describe, expect, it } from "vitest";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";
import { MOCK_LLM_MARKER } from "../src/llm/MockLlmProvider.ts";
import { buildPrompt, readMeta } from "../src/handlers/rag/query.ts";
import type { VectorMatch } from "../src/vector/types.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface RagCitation {
  url: string;
  sourceTier: number | null;
  chunkId: string;
}
interface RagResponse {
  answer: string;
  citations: RagCitation[];
  scores: { relevance: number; confidence: number; freshness: number };
}
interface ErrorBody {
  error: string;
}

beforeEach(() => {
  // Singleton mock vector index persists across requests in an isolate; reset
  // per test so retrieval is deterministic and isolated.
  resetMockVectorIndexClient();
});

async function createSource(tier: number): Promise<string> {
  const res = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name: "RAG Source", baseUrl: "https://bg3.wiki", tier },
  });
  const json: { sourceId: string } = await res.json();
  return json.sourceId;
}

async function storePage(sourceId: string, url: string, html: string): Promise<string> {
  const res = await call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: { sourceId, url, html },
  });
  const json: { pageId: string } = await res.json();
  return json.pageId;
}

async function indexPage(pageId: string): Promise<void> {
  await call(`/v1/kb/pages/${pageId}/index`, { method: "POST", headers: AUTH });
}

const ASTARION_HTML =
  "<h1>Astarion</h1><p>" +
  "Astarion is a high elf vampire spawn companion in Baldur's Gate 3. ".repeat(40) +
  "</p><h2>Origins</h2><p>" +
  "He was a magistrate turned spawn by the vampire lord Cazador Szarr. ".repeat(40) +
  "</p>";

async function ragQuery(body: unknown): Promise<Response> {
  return call("/v1/rag/query", { method: "POST", jsonBody: body });
}

describe("POST /v1/rag/query", () => {
  it("answers from indexed context with citations and bounded scores", async () => {
    const sourceId = await createSource(1);
    const url = "https://bg3.wiki/Astarion";
    const pageId = await storePage(sourceId, url, ASTARION_HTML);
    await indexPage(pageId);

    const res = await ragQuery({ question: "Who is Astarion?" });
    expect(res.status).toBe(200);
    const json: RagResponse = await res.json();

    // Deterministic mock LLM marker + the answer reflects the assembled context.
    expect(json.answer).toContain(MOCK_LLM_MARKER);
    expect(json.answer.length).toBeGreaterThan(0);

    // Citations reference the indexed page's url + chunk ids + source tier.
    expect(json.citations.length).toBeGreaterThan(0);
    for (const c of json.citations) {
      expect(c.url).toBe(url);
      expect(c.sourceTier).toBe(1);
      expect(c.chunkId.startsWith(`${pageId}:`)).toBe(true);
    }
    // Citations are deduped by chunk id.
    const chunkIds = json.citations.map((c) => c.chunkId);
    expect(new Set(chunkIds).size).toBe(chunkIds.length);

    // Scores all in [0, 1]; relevance/freshness positive for a fresh, matching page.
    for (const v of [json.scores.relevance, json.scores.confidence, json.scores.freshness]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(json.scores.relevance).toBeGreaterThan(0);
    expect(json.scores.freshness).toBeGreaterThan(0);
  });

  it("respects topK by limiting the number of matches/citations", async () => {
    const sourceId = await createSource(2);
    const pageId = await storePage(sourceId, "https://bg3.wiki/Karlach", ASTARION_HTML);
    await indexPage(pageId);

    const res = await ragQuery({ question: "Tell me about this character", topK: 1 });
    expect(res.status).toBe(200);
    const json: RagResponse = await res.json();
    expect(json.citations.length).toBeLessThanOrEqual(1);
    expect(json.citations[0]!.sourceTier).toBe(2);
  });

  it("returns the empty-retrieval shape when the corpus is empty", async () => {
    const res = await ragQuery({ question: "Who is Astarion?" });
    expect(res.status).toBe(200);
    const json: RagResponse = await res.json();
    expect(json.citations).toEqual([]);
    expect(json.scores).toEqual({ relevance: 0, confidence: 0, freshness: 0 });
    expect(json.answer.length).toBeGreaterThan(0);
  });

  it("returns 400 when the question is missing", async () => {
    const res = await ragQuery({ topK: 3 });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("returns 400 when the question is blank", async () => {
    const res = await ragQuery({ question: "" });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("returns 400 when topK is out of range", async () => {
    const tooBig = await ragQuery({ question: "hi", topK: 50 });
    expect(tooBig.status).toBe(400);
    const tooSmall = await ragQuery({ question: "hi", topK: 0 });
    expect(tooSmall.status).toBe(400);
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await call("/v1/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("indexes a tier-3 source and cites it with sourceTier=3", async () => {
    const sourceId = await createSource(3);
    const pageId = await storePage(sourceId, "https://bg3.wiki/Shadowheart", ASTARION_HTML);
    await indexPage(pageId);
    const res = await ragQuery({ question: "Who is this?" });
    const json: RagResponse = await res.json();
    expect(json.citations.every((c) => c.sourceTier === 3)).toBe(true);
  });
});

describe("readMeta", () => {
  function match(metadata?: Record<string, unknown>): VectorMatch {
    return { id: "v1", score: 0.9, ...(metadata !== undefined ? { metadata } : {}) };
  }

  it("reads complete metadata from a match", () => {
    expect(
      readMeta(match({ page_id: "p1", chunk_id: "p1:0", source_tier: 2, url: "https://x/p" })),
    ).toEqual({ pageId: "p1", chunkId: "p1:0", sourceTier: 2, url: "https://x/p" });
  });

  it("treats a non-numeric source_tier as null", () => {
    const m = readMeta(
      match({ page_id: "p1", chunk_id: "p1:0", source_tier: null, url: "https://x/p" }),
    );
    expect(m!.sourceTier).toBeNull();
  });

  it("returns null when metadata is absent", () => {
    expect(readMeta(match())).toBeNull();
  });

  it("returns null when a required string field is missing or non-string", () => {
    expect(readMeta(match({ page_id: "p1", source_tier: 1, url: "https://x" }))).toBeNull();
    expect(
      readMeta(match({ page_id: 1, chunk_id: "p1:0", source_tier: 1, url: "https://x" })),
    ).toBeNull();
    expect(readMeta(match({ page_id: "p1", chunk_id: "p1:0", source_tier: 1, url: 5 }))).toBeNull();
  });
});

describe("buildPrompt", () => {
  it("embeds the context and the question with grounding instructions", () => {
    const prompt = buildPrompt("CTX", "What is X?");
    expect(prompt).toContain("Context:\nCTX");
    expect(prompt).toContain("Question: What is X?");
    expect(prompt).toContain("only the context");
  });
});
