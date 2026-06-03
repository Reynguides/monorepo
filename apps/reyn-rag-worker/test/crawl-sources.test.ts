import { describe, expect, it } from "vitest";
import {
  SOURCES,
  getSourceById,
  getSourceByHost,
  tierForHost,
  TIER_AUTHORITATIVE,
  TIER_COMMUNITY_WIKI,
  TIER_COMMUNITY_GUIDE,
} from "../src/lib/sources.ts";

describe("SOURCES catalog", () => {
  it("has the three ADR-0015 sources with correct hosts + tiers", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(ids).toEqual(["bg3-wiki", "fextralife", "gamerguides"]);

    expect(getSourceById("bg3-wiki")).toMatchObject({
      host: "bg3.wiki",
      tier: TIER_AUTHORITATIVE,
    });
    expect(getSourceById("fextralife")).toMatchObject({
      host: "baldursgate3.wiki.fextralife.com",
      tier: TIER_COMMUNITY_WIKI,
    });
    expect(getSourceById("gamerguides")).toMatchObject({
      host: "www.gamerguides.com",
      tier: TIER_COMMUNITY_GUIDE,
    });
  });

  it("baseUrl host matches the source host for every source", () => {
    for (const s of SOURCES) {
      expect(new URL(s.baseUrl).host).toBe(s.host);
    }
  });

  it("getSourceById returns null for an unknown id", () => {
    expect(getSourceById("nope")).toBeNull();
  });

  it("getSourceByHost matches case-insensitively and returns null otherwise", () => {
    expect(getSourceByHost("BG3.WIKI")?.id).toBe("bg3-wiki");
    expect(getSourceByHost("example.com")).toBeNull();
  });

  it("tierForHost returns the tier or null", () => {
    expect(tierForHost("bg3.wiki")).toBe(TIER_AUTHORITATIVE);
    expect(tierForHost("www.gamerguides.com")).toBe(TIER_COMMUNITY_GUIDE);
    expect(tierForHost("unknown.test")).toBeNull();
  });
});
