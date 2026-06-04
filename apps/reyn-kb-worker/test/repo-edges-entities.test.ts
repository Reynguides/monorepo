import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";
import {
  insertEdges,
  listEdgesBySrcPage,
  deleteEdgesBySrcPage,
  listDanglingEdgeIds,
} from "../src/repo/edges.ts";
import { upsertEntity, getEntityByNormalized, listEntities } from "../src/repo/entities.ts";

const now = 1_700_000_000_000;

async function page(id: string, url: string): Promise<void> {
  await upsertPageByUrl(env.KB_DB, {
    id,
    sourceId: "s1",
    url,
    contentHash: "h",
    crawledAt: now,
    updatedAt: now,
  });
}

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://x",
    tier: 1,
    createdAt: now,
  });
  await page("p1", "https://x/p1");
  await page("p2", "https://x/p2");
});

describe("repo/edges", () => {
  it("is a no-op on empty input", async () => {
    await insertEdges(env.KB_DB, []);
    expect(await listEdgesBySrcPage(env.KB_DB, "p1")).toEqual([]);
  });

  it("inserts edges, ignores duplicates, lists and deletes by src", async () => {
    await insertEdges(env.KB_DB, [
      {
        id: "e0",
        srcPageId: "p1",
        dstPageId: "p2",
        dstUrl: "https://x/p2",
        edgeType: "link",
        weight: 2,
        createdAt: now,
      },
      {
        id: "e1",
        srcPageId: "p1",
        dstUrl: "https://x/ext",
        edgeType: "see_also",
        evidence: "See also",
        createdAt: now,
      },
    ]);
    // Duplicate on (src, dst_url, edge_type) is ignored.
    await insertEdges(env.KB_DB, [
      { id: "e0-dup", srcPageId: "p1", dstUrl: "https://x/p2", edgeType: "link", createdAt: now },
    ]);
    const edges = await listEdgesBySrcPage(env.KB_DB, "p1");
    expect(edges.length).toBe(2);
    const link = edges.find((e) => e.edge_type === "link")!;
    expect(link.id).toBe("e0");
    expect(link.weight).toBe(2);
    expect(edges.find((e) => e.edge_type === "see_also")!.evidence).toBe("See also");

    await deleteEdgesBySrcPage(env.KB_DB, "p1");
    expect(await listEdgesBySrcPage(env.KB_DB, "p1")).toEqual([]);
  });

  it("flags dangling resolved edges (dst_page_id points at a missing page)", async () => {
    await insertEdges(env.KB_DB, [
      {
        id: "ok",
        srcPageId: "p1",
        dstPageId: "p2",
        dstUrl: "https://x/p2",
        edgeType: "link",
        createdAt: now,
      },
      {
        id: "bad",
        srcPageId: "p1",
        dstPageId: "ghost",
        dstUrl: "https://x/ghost",
        edgeType: "link",
        createdAt: now,
      },
    ]);
    expect(await listDanglingEdgeIds(env.KB_DB)).toEqual(["bad"]);
  });
});

describe("repo/entities", () => {
  it("upserts by (normalized, kind), reads back, and updates the canonical page", async () => {
    await upsertEntity(env.KB_DB, {
      id: "ent0",
      kind: "spell",
      name: "Fireball",
      normalized: "fireball",
      createdAt: now,
    });
    let row = await getEntityByNormalized(env.KB_DB, "fireball", "spell");
    expect(row!.name).toBe("Fireball");
    expect(row!.canonical_page_id).toBeNull();

    await upsertEntity(env.KB_DB, {
      id: "ent0-again",
      kind: "spell",
      name: "Fireball",
      normalized: "fireball",
      canonicalPageId: "p1",
      createdAt: now,
    });
    row = await getEntityByNormalized(env.KB_DB, "fireball", "spell");
    expect(row!.id).toBe("ent0"); // original id preserved on conflict
    expect(row!.canonical_page_id).toBe("p1");
  });

  it("returns null for unknown entity and lists all", async () => {
    await upsertEntity(env.KB_DB, {
      id: "e",
      kind: "item",
      name: "X",
      normalized: "x",
      createdAt: now,
    });
    expect(await getEntityByNormalized(env.KB_DB, "nope", "item")).toBeNull();
    expect((await listEntities(env.KB_DB)).length).toBe(1);
  });
});
