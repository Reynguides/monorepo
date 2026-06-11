import { describe, expect, it } from "vitest";
import { freshnessScore, tierBoost } from "../src/lib/scoring.ts";

const DAY = 86_400_000;

describe("tierBoost", () => {
  it("rewards lower (more authoritative) tiers", () => {
    expect(tierBoost(1)).toBeCloseTo(0.05);
    expect(tierBoost(2)).toBeCloseTo(0.025);
    expect(tierBoost(5)).toBeCloseTo(0.01);
  });

  it("returns 0 for null or sub-1 tiers", () => {
    expect(tierBoost(null)).toBe(0);
    expect(tierBoost(0)).toBe(0);
  });
});

describe("freshnessScore", () => {
  it("is ~1 just-crawled, 0.5 at one half-life, 0.25 at two", () => {
    const now = 1_000 * DAY;
    expect(freshnessScore(now, now, 90)).toBeCloseTo(1);
    expect(freshnessScore(now - 90 * DAY, now, 90)).toBeCloseTo(0.5);
    expect(freshnessScore(now - 180 * DAY, now, 90)).toBeCloseTo(0.25);
  });

  it("decays monotonically with age", () => {
    const now = 1_000 * DAY;
    const recent = freshnessScore(now - 10 * DAY, now, 90);
    const older = freshnessScore(now - 100 * DAY, now, 90);
    expect(recent).toBeGreaterThan(older);
  });

  it("clamps a future crawl time to 1", () => {
    const now = 1_000 * DAY;
    expect(freshnessScore(now + 10 * DAY, now, 90)).toBe(1);
  });
});
