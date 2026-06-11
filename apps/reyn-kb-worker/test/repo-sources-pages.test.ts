import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { upsertSource, getSourceById, listSources } from "../src/repo/sources.ts";
import {
  upsertPageByUrl,
  getPageById,
  getPageBySourceUrl,
  listPagesBySource,
  listAllPages,
  getPagesByIds,
  mapUrlsToPageIds,
} from "../src/repo/pages.ts";

const now = 1_700_000_000_000;

async function seedSource(id = "s1"): Promise<void> {
  await upsertSource(env.KB_DB, {
    id,
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: now,
  });
}

describe("repo/sources", () => {
  it("inserts then updates a source by id; reads it back", async () => {
    await seedSource();
    let row = await getSourceById(env.KB_DB, "s1");
    expect(row!.name).toBe("BG3 Wiki");
    expect(row!.license).toBeNull();

    await upsertSource(env.KB_DB, {
      id: "s1",
      name: "BG3 Wiki (CC-BY-SA)",
      baseUrl: "https://bg3.wiki",
      tier: 1,
      license: "CC-BY-SA-4.0",
      createdAt: now,
    });
    row = await getSourceById(env.KB_DB, "s1");
    expect(row!.name).toBe("BG3 Wiki (CC-BY-SA)");
    expect(row!.license).toBe("CC-BY-SA-4.0");
  });

  it("returns null for an unknown id and lists sources by tier", async () => {
    await seedSource("s1");
    await upsertSource(env.KB_DB, {
      id: "s2",
      name: "Fextralife",
      baseUrl: "https://x",
      tier: 2,
      license: null,
      createdAt: now,
    });
    expect(await getSourceById(env.KB_DB, "nope")).toBeNull();
    const all = await listSources(env.KB_DB);
    expect(all.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("repo/pages", () => {
  it("inserts a new page (defaults) and updates by (source_id,url) bumping version", async () => {
    await seedSource();
    const first = await upsertPageByUrl(env.KB_DB, {
      id: "p1",
      sourceId: "s1",
      url: "https://bg3.wiki/Fireball",
      contentHash: "h1",
      crawledAt: now,
      updatedAt: now,
    });
    expect(first).toEqual({ id: "p1", isNew: true });
    let row = await getPageById(env.KB_DB, "p1");
    expect(row!.page_type).toBe("article");
    expect(row!.version).toBe(1);
    expect(row!.title).toBeNull();

    const second = await upsertPageByUrl(env.KB_DB, {
      id: "p-ignored",
      sourceId: "s1",
      url: "https://bg3.wiki/Fireball",
      title: "Fireball",
      pageType: "spell",
      contentHash: "h2",
      r2RawKey: "pages/p1/raw.html",
      crawledAt: now,
      updatedAt: now + 1,
    });
    expect(second).toEqual({ id: "p1", isNew: false });
    row = await getPageById(env.KB_DB, "p1");
    expect(row!.title).toBe("Fireball");
    expect(row!.page_type).toBe("spell");
    expect(row!.r2_raw_key).toBe("pages/p1/raw.html");
    expect(row!.version).toBe(2);
  });

  it("looks up by source+url and returns null when absent", async () => {
    await seedSource();
    await upsertPageByUrl(env.KB_DB, {
      id: "p1",
      sourceId: "s1",
      url: "https://bg3.wiki/A",
      contentHash: "h",
      crawledAt: now,
      updatedAt: now,
    });
    expect((await getPageBySourceUrl(env.KB_DB, "s1", "https://bg3.wiki/A"))!.id).toBe("p1");
    expect(await getPageBySourceUrl(env.KB_DB, "s1", "https://bg3.wiki/missing")).toBeNull();
    expect(await getPageById(env.KB_DB, "missing")).toBeNull();
  });

  it("paginates by cursor and lists all pages", async () => {
    await seedSource();
    for (const n of [1, 2, 3]) {
      await upsertPageByUrl(env.KB_DB, {
        id: `p${n}`,
        sourceId: "s1",
        url: `https://bg3.wiki/${n}`,
        contentHash: "h",
        crawledAt: now,
        updatedAt: now,
      });
    }
    const page1 = await listPagesBySource(env.KB_DB, "s1", 2, null);
    expect(page1.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(page1.nextCursor).toBe("p2");

    const page2 = await listPagesBySource(env.KB_DB, "s1", 2, page1.nextCursor);
    expect(page2.pages.map((p) => p.id)).toEqual(["p3"]);
    expect(page2.nextCursor).toBeNull();

    expect((await listAllPages(env.KB_DB)).length).toBe(3);
  });

  it("resolves more urls than D1's per-query bound-parameter cap (regression)", async () => {
    await seedSource();
    await upsertPageByUrl(env.KB_DB, {
      id: "pa",
      sourceId: "s1",
      url: "https://bg3.wiki/Drow",
      contentHash: "h",
      crawledAt: now,
      updatedAt: now,
    });
    await upsertPageByUrl(env.KB_DB, {
      id: "pb",
      sourceId: "s1",
      url: "https://bg3.wiki/Githyanki",
      contentHash: "h",
      crawledAt: now,
      updatedAt: now,
    });
    // 250 distinct urls exceed D1's hard limit of 100 bound parameters per query.
    // Before the IN-list was chunked, this threw "D1_ERROR: too many SQL variables"
    // (link-heavy wiki pages carry hundreds of links).
    const urls = Array.from({ length: 250 }, (_, i) => `https://bg3.wiki/Link_${i}`);
    urls.push("https://bg3.wiki/Drow", "https://bg3.wiki/Githyanki");

    const map = await mapUrlsToPageIds(env.KB_DB, "s1", urls);
    expect(map.size).toBe(2);
    expect(map.get("https://bg3.wiki/Drow")).toBe("pa");
    expect(map.get("https://bg3.wiki/Githyanki")).toBe("pb");
    expect(map.has("https://bg3.wiki/Link_0")).toBe(false);
  });

  it("loads more page ids than D1's per-query bound-parameter cap (regression)", async () => {
    await seedSource();
    const ids = Array.from({ length: 150 }, (_, i) => `pp${i}`);
    for (let i = 0; i < ids.length; i++) {
      await upsertPageByUrl(env.KB_DB, {
        id: ids[i]!,
        sourceId: "s1",
        url: `https://bg3.wiki/page/${i}`,
        contentHash: "h",
        crawledAt: now,
        updatedAt: now,
      });
    }
    // Search hydration loads one page per distinct result; a common-term search
    // easily spans >100 pages. Before getPagesByIds chunked its IN-list, this
    // threw "D1_ERROR: too many SQL variables".
    const map = await getPagesByIds(env.KB_DB, ids);
    expect(map.size).toBe(150);
    expect(map.get("pp0")!.url).toBe("https://bg3.wiki/page/0");
    expect(map.get("pp149")!.url).toBe("https://bg3.wiki/page/149");
  });
});
