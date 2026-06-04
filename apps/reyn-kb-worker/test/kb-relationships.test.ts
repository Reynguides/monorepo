import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { getPageById } from "../src/repo/pages.ts";
import { listEdgesBySrcPage } from "../src/repo/edges.ts";
import { getEntityByNormalized } from "../src/repo/entities.ts";
import { resetMockVectorIndexClient } from "../src/vector/factory.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

async function storeAndIndex(
  sourceId: string,
  url: string,
  html: string,
  title: string,
  pageType: string,
): Promise<string> {
  const stored = await readJson<{ pageId: string }>(
    await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId, url, html, title, pageType },
    }),
  );
  await call(`/v1/kb/pages/${stored.pageId}/index`, { method: "POST", headers: AUTH });
  return stored.pageId;
}

beforeEach(async () => {
  resetMockVectorIndexClient();
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
  await upsertSource(env.KB_DB, {
    id: "s2",
    name: "Fextralife",
    baseUrl: "https://fex.example",
    tier: 2,
    createdAt: Date.now(),
  });
});

describe("relationship building during index", () => {
  it("builds resolved link edges and entity_mention edges", async () => {
    const wizardId = await storeAndIndex(
      "s1",
      "https://bg3.wiki/wiki/Wizard",
      "<html><body><h1>Wizard</h1><p>An arcane spellcaster.</p></body></html>",
      "Wizard",
      "class",
    );
    const fireId = await storeAndIndex(
      "s1",
      "https://bg3.wiki/wiki/Fireball",
      '<html><body><h1>Fireball</h1><p>A <a href="/wiki/Wizard">Wizard</a> spell.</p></body></html>',
      "Fireball",
      "spell",
    );

    const edges = await listEdgesBySrcPage(env.KB_DB, fireId);
    const link = edges.find((e) => e.edge_type === "link");
    expect(link).toBeDefined();
    expect(link!.dst_page_id).toBe(wizardId);
    expect(link!.dst_url).toBe("https://bg3.wiki/wiki/Wizard");

    const mention = edges.find(
      (e) => e.edge_type === "entity_mention" && e.dst_page_id === wizardId,
    );
    expect(mention).toBeDefined();

    // The page registered itself as an entity.
    const entity = await getEntityByNormalized(env.KB_DB, "fireball", "spell");
    expect(entity!.canonical_page_id).toBe(fireId);
  });

  it("resolves a cross-source entity conflict by tier (lower wins; loser deprecated)", async () => {
    const authoritative = await storeAndIndex(
      "s1",
      "https://bg3.wiki/wiki/Owlbear",
      "<html><body><h1>Owlbear</h1><p>A fearsome beast.</p></body></html>",
      "Owlbear",
      "creature",
    );
    const community = await storeAndIndex(
      "s2",
      "https://fex.example/Owlbear",
      "<html><body><h1>Owlbear</h1><p>Community notes on the beast.</p></body></html>",
      "Owlbear",
      "creature",
    );

    // Tier 1 (s1) wins; the tier-2 page is deprecated.
    const entity = await getEntityByNormalized(env.KB_DB, "owlbear", "creature");
    expect(entity!.canonical_page_id).toBe(authoritative);
    expect((await getPageById(env.KB_DB, community))!.lifecycle).toBe("deprecated");

    const winnerEdges = await listEdgesBySrcPage(env.KB_DB, authoritative);
    const supersedes = winnerEdges.find((e) => e.edge_type === "supersedes");
    expect(supersedes!.dst_page_id).toBe(community);
  });

  it("leaves a same-tier conflict unresolved (keeps existing canonical, no deprecation)", async () => {
    await upsertSource(env.KB_DB, {
      id: "s3",
      name: "Other Wiki",
      baseUrl: "https://other.example",
      tier: 1,
      createdAt: Date.now(),
    });
    const first = await storeAndIndex(
      "s1",
      "https://bg3.wiki/wiki/Goblin",
      "<html><body><h1>Goblin</h1><p>A small foe.</p></body></html>",
      "Goblin",
      "creature",
    );
    const second = await storeAndIndex(
      "s3",
      "https://other.example/Goblin",
      "<html><body><h1>Goblin</h1><p>Other notes.</p></body></html>",
      "Goblin",
      "creature",
    );
    const entity = await getEntityByNormalized(env.KB_DB, "goblin", "creature");
    expect(entity!.canonical_page_id).toBe(first); // tie → existing canonical kept
    expect((await getPageById(env.KB_DB, second))!.lifecycle).toBe("active"); // not deprecated
  });
});
