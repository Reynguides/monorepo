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
