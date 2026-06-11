import { describe, expect, it } from "vitest";
import {
  getSource,
  shouldIngest,
  toPageRequest,
  toSourceRegistration,
  type SourceDef,
} from "../src/lib/sources.ts";

const bg3 = getSource("bg3-wiki")!;

describe("getSource", () => {
  it("resolves a known source and returns undefined otherwise", () => {
    expect(getSource("bg3-wiki")?.tier).toBe(1);
    expect(getSource("nope")).toBeUndefined();
  });
});

describe("game8 source", () => {
  const game8 = getSource("game8");

  it("targets the single BG3 per-game sitemap, not the all-games index", () => {
    expect(game8).toBeDefined();
    expect(game8!.baseUrl).toBe("https://game8.co");
    expect(game8!.sitemapUrl).toBe("https://game8.co/sitemaps/game_1237.xml.gz");
    expect(game8!.allowPathPrefixes).toEqual(["/games/BG3/"]);
  });

  it("ingests BG3 archive URLs but rejects other games on the same host", () => {
    expect(shouldIngest("https://game8.co/games/BG3/archives/419608", game8!)).toBe(true);
    expect(shouldIngest("https://game8.co/games/Genshin-Impact/archives/1", game8!)).toBe(false);
    // The trailing slash guards against slug-prefix collisions (e.g. a "BG3X" game)
    // and excludes the bare hub page, which the sitemap does not list anyway.
    expect(shouldIngest("https://game8.co/games/BG3X/archives/1", game8!)).toBe(false);
    expect(shouldIngest("https://game8.co/games/BG3", game8!)).toBe(false);
  });
});

describe("shouldIngest", () => {
  it("accepts a real article URL on the allowed path", () => {
    expect(shouldIngest("https://bg3.wiki/wiki/Fireball", bg3)).toBe(true);
  });

  it("rejects a different origin", () => {
    expect(shouldIngest("https://evil.example/wiki/Fireball", bg3)).toBe(false);
  });

  it("rejects URLs off the allowed path prefix", () => {
    expect(shouldIngest("https://bg3.wiki/index.php?title=Fireball", bg3)).toBe(false);
  });

  it("rejects MediaWiki meta/namespace pages", () => {
    for (const ns of ["Category:Spells", "Talk:Fireball", "Special:Random", "File:Icon.png"]) {
      expect(shouldIngest(`https://bg3.wiki/wiki/${ns}`, bg3)).toBe(false);
    }
  });

  it("rejects an unparseable URL", () => {
    expect(shouldIngest("not a url", bg3)).toBe(false);
  });

  it("returns false when the source base URL is itself invalid", () => {
    const broken: SourceDef = { ...bg3, baseUrl: "::bad::" };
    expect(shouldIngest("https://bg3.wiki/wiki/Fireball", broken)).toBe(false);
  });

  it("treats an empty prefix list as no path constraint", () => {
    const anyPath: SourceDef = { ...bg3, allowPathPrefixes: [] };
    expect(shouldIngest("https://bg3.wiki/Fireball", anyPath)).toBe(true);
  });
});

describe("request builders", () => {
  it("maps a source to its registration body", () => {
    expect(toSourceRegistration(bg3)).toEqual({
      id: "bg3-wiki",
      name: "BG3 Wiki",
      baseUrl: "https://bg3.wiki",
      tier: 1,
      license: "CC BY-SA 4.0",
    });
  });

  it("maps a crawled page to its ingest body with the source's default page type", () => {
    expect(toPageRequest(bg3, "https://bg3.wiki/wiki/Fireball", "<html></html>")).toEqual({
      sourceId: "bg3-wiki",
      url: "https://bg3.wiki/wiki/Fireball",
      html: "<html></html>",
      pageType: "article",
    });
  });
});

describe("game8 title cleaning", () => {
  const game8 = getSource("game8")!;
  const url = "https://game8.co/games/BG3/archives/417750";

  it("strips the trailing site/game suffix from the <title> fallback", () => {
    const req = toPageRequest(
      game8,
      url,
      "<html></html>",
      "List of Feats | Baldur's Gate 3 (BG3)｜Game8",
    );
    expect(req.title).toBe("List of Feats");
  });

  it("leaves a clean title (no suffix) untouched", () => {
    const req = toPageRequest(game8, url, "<x>", "Barbarian Class: Best Builds and Subclasses");
    expect(req.title).toBe("Barbarian Class: Best Builds and Subclasses");
  });

  it("only trims sources that configure a suffix (scoped, not global)", () => {
    const req = toPageRequest(
      bg3,
      "https://bg3.wiki/wiki/X",
      "<x>",
      "X | Baldur's Gate 3 (BG3)｜Game8",
    );
    expect(req.title).toBe("X | Baldur's Gate 3 (BG3)｜Game8");
  });
});
