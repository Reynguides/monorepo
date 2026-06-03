import { describe, expect, it } from "vitest";
import { rerankByTier, tierBoost, TIER_BOOST_WEIGHT } from "../src/lib/rerank.ts";

describe("tierBoost", () => {
  it("grants the full weight to tier 1", () => {
    expect(tierBoost(1)).toBeCloseTo(TIER_BOOST_WEIGHT);
  });

  it("decays as the tier number grows", () => {
    expect(tierBoost(2)).toBeCloseTo(TIER_BOOST_WEIGHT / 2);
    expect(tierBoost(5)).toBeCloseTo(TIER_BOOST_WEIGHT / 5);
  });

  it("is 0 for an unknown (null/undefined) tier", () => {
    expect(tierBoost(null)).toBe(0);
    expect(tierBoost(undefined)).toBe(0);
  });

  it("is 0 for a non-positive tier (defensive)", () => {
    expect(tierBoost(0)).toBe(0);
  });
});

describe("rerankByTier", () => {
  it("boosts an authoritative chunk above a slightly-more-similar lower-tier one", () => {
    // Tier-1 boost (+0.05) overtakes a 0.02 cosine gap.
    const input = [
      { id: "b", score: 0.82, tier: 3 },
      { id: "a", score: 0.8, tier: 1 },
    ];
    const out = rerankByTier(input);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not reorder when the cosine gap exceeds the boost difference", () => {
    const input = [
      { id: "a", score: 0.9, tier: 3 },
      { id: "b", score: 0.7, tier: 1 },
    ];
    const out = rerankByTier(input);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("is stable: equal adjusted scores keep input order", () => {
    const input = [
      { id: "first", score: 0.5, tier: 2 },
      { id: "second", score: 0.5, tier: 2 },
    ];
    const out = rerankByTier(input);
    expect(out.map((x) => x.id)).toEqual(["first", "second"]);
  });

  it("treats a null tier as no boost", () => {
    const input = [
      { id: "tiered", score: 0.6, tier: 1 },
      { id: "untiered", score: 0.62, tier: null },
    ];
    const out = rerankByTier(input);
    // 0.6 + 0.05 = 0.65 > 0.62 → tiered wins.
    expect(out.map((x) => x.id)).toEqual(["tiered", "untiered"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { id: "a", score: 0.1, tier: 5 },
      { id: "b", score: 0.9, tier: 5 },
    ];
    const snapshot = input.map((x) => x.id);
    rerankByTier(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
