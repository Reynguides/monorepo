import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";
import { replaceSectionsForPage, listSectionsByPage } from "../src/repo/sections.ts";
import {
  insertChunks,
  listChunksByPageId,
  deleteChunksByPageId,
  getChunksByIds,
} from "../src/repo/chunks.ts";

const now = 1_700_000_000_000;

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://x",
    tier: 1,
    createdAt: now,
  });
  await upsertPageByUrl(env.KB_DB, {
    id: "p1",
    sourceId: "s1",
    url: "https://x/p1",
    contentHash: "h",
    crawledAt: now,
    updatedAt: now,
  });
});

describe("repo/sections", () => {
  it("replaces sections for a page (delete + insert) and lists them in order", async () => {
    await replaceSectionsForPage(env.KB_DB, "p1", [
      { id: "sec0", ord: 0, level: 1, heading: "Overview", headingPath: "Overview" },
      {
        id: "sec1",
        ord: 1,
        level: 2,
        heading: "Cantrips",
        anchor: "cantrips",
        headingPath: "Overview > Cantrips",
      },
    ]);
    let secs = await listSectionsByPage(env.KB_DB, "p1");
    expect(secs.map((s) => s.heading)).toEqual(["Overview", "Cantrips"]);
    expect(secs[1]!.anchor).toBe("cantrips");

    // Replace with a smaller set — old rows must be gone.
    await replaceSectionsForPage(env.KB_DB, "p1", [
      { id: "sec0b", ord: 0, level: 1, heading: "Only", headingPath: "Only" },
    ]);
    secs = await listSectionsByPage(env.KB_DB, "p1");
    expect(secs.map((s) => s.heading)).toEqual(["Only"]);
    expect(secs[0]!.anchor).toBeNull();
  });
});

describe("repo/chunks", () => {
  it("is a no-op on empty input", async () => {
    await insertChunks(env.KB_DB, []);
    expect(await listChunksByPageId(env.KB_DB, "p1")).toEqual([]);
    expect(await getChunksByIds(env.KB_DB, [])).toEqual([]);
  });

  it("inserts chunks and lists them by page in ord order", async () => {
    await insertChunks(env.KB_DB, [
      {
        id: "p1:0",
        pageId: "p1",
        ord: 0,
        headingPath: "H",
        text: "alpha",
        contentHash: "c0",
        tokenCount: 1,
      },
      {
        id: "p1:1",
        pageId: "p1",
        sectionId: "sec1",
        ord: 1,
        text: "beta",
        contentHash: "c1",
        tokenCount: 1,
      },
    ]);
    const chunks = await listChunksByPageId(env.KB_DB, "p1");
    expect(chunks.map((c) => c.text)).toEqual(["alpha", "beta"]);
    expect(chunks[0]!.heading_path).toBe("H");
    expect(chunks[0]!.section_id).toBeNull();
    expect(chunks[1]!.section_id).toBe("sec1");
  });

  it("fetches chunks by id in the requested order, skipping unknown ids", async () => {
    await insertChunks(env.KB_DB, [
      { id: "p1:0", pageId: "p1", ord: 0, text: "a", contentHash: "c0", tokenCount: 1 },
      { id: "p1:1", pageId: "p1", ord: 1, text: "b", contentHash: "c1", tokenCount: 1 },
    ]);
    const out = await getChunksByIds(env.KB_DB, ["p1:1", "missing", "p1:0"]);
    expect(out.map((c) => c.id)).toEqual(["p1:1", "p1:0"]);
  });

  it("deletes all chunks for a page", async () => {
    await insertChunks(env.KB_DB, [
      { id: "p1:0", pageId: "p1", ord: 0, text: "a", contentHash: "c0", tokenCount: 1 },
    ]);
    await deleteChunksByPageId(env.KB_DB, "p1");
    expect(await listChunksByPageId(env.KB_DB, "p1")).toEqual([]);
  });
});
