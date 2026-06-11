import {
  KbSearchError,
  type IKbSearchClient,
  type KbSearchRequest,
  type KbSearchResult,
} from "./types.ts";

/**
 * Deterministic canned results for local dev + tests, so the whole RAG pipeline
 * runs offline with no KB worker reachable. Two BG3 chunks with realistic score
 * shapes (one with a null keyword score, mirroring a semantic-only match).
 */
export const MOCK_KB_RESULTS: readonly KbSearchResult[] = [
  {
    chunkId: "mock-shadowheart:0",
    pageId: "mock-shadowheart",
    url: "https://bg3.wiki/wiki/Shadowheart",
    title: "Shadowheart",
    headingPath: "Shadowheart > Background",
    pageType: "creature",
    sourceTier: 1,
    snippet: "Shadowheart is a half-elf cleric of Shar and an origin companion in Baldur's Gate 3.",
    scores: { semantic: 0.82, keyword: 0.41, fused: 0.031, tier: 0.05, freshness: 0.9 },
    via: "primary",
  },
  {
    chunkId: "mock-shar:0",
    pageId: "mock-shar",
    url: "https://bg3.wiki/wiki/Shar",
    title: "Shar",
    headingPath: null,
    pageType: "article",
    sourceTier: 1,
    snippet: "Shar is the goddess of darkness, loss, and forgetting in the Forgotten Realms.",
    scores: { semantic: 0.61, keyword: null, fused: 0.016, tier: 0.05, freshness: 0.8 },
    via: "primary",
  },
];

/**
 * Mock retrieval client. Case-insensitive query sentinels make every pipeline
 * branch exercisable offline:
 * - contains "noresults" → `[]` (empty-retrieval path)
 * - contains "searchfail" → rejects with a {@link KbSearchError} (502 path)
 * - otherwise → {@link MOCK_KB_RESULTS}
 */
export class MockKbSearchClient implements IKbSearchClient {
  public search(req: KbSearchRequest): Promise<KbSearchResult[]> {
    const q = req.query.toLowerCase();
    if (q.includes("searchfail")) {
      return Promise.reject(new KbSearchError("mock KB search failure"));
    }
    if (q.includes("noresults")) {
      return Promise.resolve([]);
    }
    return Promise.resolve([...MOCK_KB_RESULTS]);
  }
}
