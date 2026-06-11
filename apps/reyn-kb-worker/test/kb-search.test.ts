import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";
import { insertEdges } from "../src/repo/edges.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

const WIZARD = `<html><head><title>Wizard</title></head><body>
<h1>Wizard</h1><p>The wizard is a scholarly arcane spellcaster who learns spells from a book.</p>
</body></html>`;

const FIREBALL = `<html><head><title>Fireball</title></head><body>
<h1>Fireball</h1>
<p>Fireball is a wizard spell that deals fire damage in a twenty-foot sphere.</p>
<p>See the <a href="/Wizard">Wizard</a> class and an
<a href="https://external.example/ref">external reference</a> for details.</p>
</body></html>`;

// One long paragraph (> 300 chars) so its single chunk exercises snippet truncation.
const LONGSWORD = `<html><head><title>Longsword</title></head><body>
<h1>Longsword</h1><p>${"A longsword is a versatile martial melee weapon dealing slashing damage to a single target. ".repeat(4)}</p>
</body></html>`;

interface SearchScores {
  semantic: number | null;
  keyword: number | null;
  fused: number;
  tier: number;
  freshness: number;
}

interface SearchResultItem {
  chunkId: string;
  pageId: string;
  url: string;
  title: string | null;
  headingPath: string | null;
  pageType: string;
  sourceTier: number;
  snippet: string;
  scores: SearchScores;
  via: "primary" | "relationship";
}

interface SearchResp {
  query: string;
  mode: string;
  results: SearchResultItem[];
}

function search(body: unknown): Promise<Response> {
  return call("/v1/kb/search", { method: "POST", jsonBody: body });
}

async function ingest(opts: {
  sourceId: string;
  url: string;
  pageType: string;
  html: string;
}): Promise<string> {
  const stored = await readJson<{ pageId: string }>(
    await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: {
        sourceId: opts.sourceId,
        url: opts.url,
        html: opts.html,
        pageType: opts.pageType,
      },
    }),
  );
  await call(`/v1/kb/pages/${stored.pageId}/index`, { method: "POST", headers: AUTH });
  return stored.pageId;
}

let fireballId = "";

beforeEach(async () => {
  resetMockVectorIndexClient();
  const now = Date.now();
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: now,
  });
  await upsertSource(env.KB_DB, {
    id: "s2",
    name: "Homebrew",
    baseUrl: "https://homebrew.example",
    tier: 2,
    createdAt: now,
  });
  // Wizard first so it is a registered entity + link target when Fireball indexes.
  await ingest({ sourceId: "s1", url: "https://bg3.wiki/Wizard", pageType: "class", html: WIZARD });
  fireballId = await ingest({
    sourceId: "s1",
    url: "https://bg3.wiki/Fireball",
    pageType: "spell",
    html: FIREBALL,
  });
  await ingest({
    sourceId: "s2",
    url: "https://homebrew.example/Longsword",
    pageType: "item",
    html: LONGSWORD,
  });
});

describe("POST /v1/kb/search", () => {
  it("returns ranked chunks for a hybrid query and never an answer field", async () => {
    const res = await search({ query: "fireball", topK: 5 });
    expect(res.status).toBe(200);
    const body = await readJson<SearchResp & { answer?: unknown }>(res);
    expect(body.mode).toBe("hybrid");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]!.scores.fused).toBeGreaterThan(0);
    expect(body.results.every((r) => r.via === "primary")).toBe(true);
    expect("answer" in body).toBe(false);
  });

  it("keyword-only mode finds the lexically matching chunk and truncates long snippets", async () => {
    const body = await readJson<SearchResp>(await search({ query: "slashing", mode: "keyword" }));
    expect(body.mode).toBe("keyword");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.pageType === "item")).toBe(true);
    expect(body.results.every((r) => r.scores.semantic === null)).toBe(true);
    expect(body.results[0]!.snippet.endsWith("…")).toBe(true);
  });

  it("semantic-only mode honours a single-pageType namespace filter", async () => {
    const body = await readJson<SearchResp>(
      await search({ query: "weapon", mode: "semantic", filters: { pageTypes: ["item"] } }),
    );
    expect(body.mode).toBe("semantic");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.pageType === "item")).toBe(true);
    expect(body.results.every((r) => r.scores.keyword === null)).toBe(true);
  });

  it("filters by page type and excludes lower-tier sources", async () => {
    const spellsOnly = await readJson<SearchResp>(
      await search({ query: "damage", mode: "keyword", filters: { pageTypes: ["spell"] } }),
    );
    expect(spellsOnly.results.length).toBeGreaterThan(0);
    expect(spellsOnly.results.every((r) => r.pageType === "spell")).toBe(true);

    const tier1 = await readJson<SearchResp>(
      await search({ query: "damage", mode: "keyword", filters: { tiersMax: 1 } }),
    );
    expect(tier1.results.length).toBeGreaterThan(0);
    expect(tier1.results.some((r) => r.url.includes("Longsword"))).toBe(false);
  });

  it("expands along link/entity_mention edges, labelled via:'relationship'", async () => {
    const body = await readJson<SearchResp>(
      await search({
        query: "fireball",
        mode: "keyword",
        expand: true,
        expandEdgeTypes: ["link", "entity_mention"],
      }),
    );
    const rel = body.results.filter((r) => r.via === "relationship");
    expect(rel.some((r) => r.url.includes("Wizard"))).toBe(true);
    expect(rel.every((r) => r.scores.semantic === null && r.scores.keyword === null)).toBe(true);
  });

  it("default expansion adds nothing when only link/mention edges exist", async () => {
    const body = await readJson<SearchResp>(
      await search({ query: "fireball", mode: "keyword", expand: true }),
    );
    expect(body.results.every((r) => r.via === "primary")).toBe(true);
  });

  it("drops relationship targets that are dangling or unindexed", async () => {
    await upsertPageByUrl(env.KB_DB, {
      id: "stub-page",
      sourceId: "s1",
      url: "https://bg3.wiki/Stub",
      contentHash: "h",
      crawledAt: Date.now(),
      updatedAt: Date.now(),
    });
    await insertEdges(env.KB_DB, [
      {
        id: "e-dangling",
        srcPageId: fireballId,
        dstPageId: "ghost",
        edgeType: "see_also",
        createdAt: Date.now(),
      },
      {
        id: "e-stub",
        srcPageId: fireballId,
        dstPageId: "stub-page",
        edgeType: "see_also",
        createdAt: Date.now(),
      },
    ]);
    const body = await readJson<SearchResp>(
      await search({
        query: "fireball",
        mode: "keyword",
        expand: true,
        expandEdgeTypes: ["see_also"],
      }),
    );
    expect(body.results.every((r) => r.via === "primary")).toBe(true);
  });

  it("returns an empty result set for a non-matching keyword query", async () => {
    const body = await readJson<SearchResp>(
      await search({ query: "zzzxqynomatch", mode: "keyword" }),
    );
    expect(body.results).toEqual([]);
  });

  it("rejects an empty query with 400", async () => {
    expect((await search({ query: "" })).status).toBe(400);
    expect((await search({})).status).toBe(400);
  });
});
