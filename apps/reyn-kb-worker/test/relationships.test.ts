import { describe, expect, it } from "vitest";
import {
  normalizeName,
  absolutizeUrl,
  buildLinkEdges,
  buildEntityMentionEdges,
  type EntityLite,
} from "../src/lib/relationships.ts";
import type { ExtractedLink } from "../src/lib/extract.ts";

function counter(): () => string {
  let n = 0;
  return () => `e${n++}`;
}
const NOW = 1_700_000_000_000;

describe("normalizeName", () => {
  it("lowercases, de-articles, and strips punctuation", () => {
    expect(normalizeName("The Fireball!")).toBe("fireball");
    expect(normalizeName("Astarion's Quest")).toBe("astarion s quest");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("absolutizeUrl", () => {
  it("resolves relative urls and returns null on an invalid base", () => {
    expect(absolutizeUrl("/wiki/Wizard", "https://bg3.wiki/Fireball")).toBe(
      "https://bg3.wiki/wiki/Wizard",
    );
    expect(absolutizeUrl("/x", "not-a-valid-base")).toBeNull();
  });
});

describe("buildLinkEdges", () => {
  it("builds deduped link edges with resolved + unresolved destinations", () => {
    const links: ExtractedLink[] = [
      { href: "/wiki/Wizard", text: "Wizard" },
      { href: "/wiki/Wizard", text: "again" }, // dup → ignored
      { href: "/wiki/Unknown", text: "Unknown" },
    ];
    const resolve = (u: string): string | null =>
      u === "https://bg3.wiki/wiki/Wizard" ? "p-wizard" : null;
    const edges = buildLinkEdges(
      "p-fire",
      "https://bg3.wiki/Fireball",
      links,
      resolve,
      counter(),
      NOW,
    );
    expect(edges.length).toBe(2);
    expect(edges[0]).toMatchObject({
      srcPageId: "p-fire",
      dstUrl: "https://bg3.wiki/wiki/Wizard",
      dstPageId: "p-wizard",
      edgeType: "link",
      evidence: "Wizard",
    });
    expect(edges[1]!.dstPageId).toBeUndefined();
    expect(edges[1]!.dstUrl).toBe("https://bg3.wiki/wiki/Unknown");
  });

  it("drops self-links", () => {
    const edges = buildLinkEdges(
      "p",
      "https://x/a",
      [{ href: "https://x/a", text: "self" }],
      () => "p",
      counter(),
      NOW,
    );
    expect(edges).toEqual([]);
  });
});

describe("buildEntityMentionEdges", () => {
  it("links to entities named in the text; skips self, tiny, and null-canonical", () => {
    const entities: EntityLite[] = [
      { normalized: "wizard", canonicalPageId: "p-wizard" },
      { normalized: "fireball", canonicalPageId: "p-fire" }, // self → skip
      { normalized: "ab", canonicalPageId: "p-ab" }, // too short → skip
      { normalized: "owlbear", canonicalPageId: null }, // no canonical → skip
      { normalized: "ice knife", canonicalPageId: "p-ice" }, // not mentioned
    ];
    const edges = buildEntityMentionEdges(
      "p-fire",
      "A Wizard casts Fireball.",
      entities,
      counter(),
      NOW,
    );
    expect(edges.length).toBe(1);
    expect(edges[0]).toMatchObject({
      srcPageId: "p-fire",
      dstPageId: "p-wizard",
      edgeType: "entity_mention",
    });
  });
});
