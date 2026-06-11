import { describe, expect, it } from "vitest";
import { relevanceScore, confidenceScore, freshnessScore } from "../src/lib/scoring.ts";

const DAY_MS = 1000 * 60 * 60 * 24;

describe("relevanceScore", () => {
  it("is 0 for an empty list", () => {
    expect(relevanceScore([])).toBe(0);
  });

  it("is the arithmetic mean of the scores", () => {
    expect(relevanceScore([0.4, 0.6])).toBeCloseTo(0.5);
    expect(relevanceScore([0.9])).toBeCloseTo(0.9);
  });

  it("clamps an out-of-range mean into [0, 1]", () => {
    expect(relevanceScore([1.4, 1.6])).toBe(1);
    expect(relevanceScore([-0.5, -0.5])).toBe(0);
  });
});

describe("confidenceScore", () => {
  it("is 0 for an empty list", () => {
    expect(confidenceScore([], 0.5)).toBe(0);
  });

  it("is the fraction of matches at or above the threshold", () => {
    expect(confidenceScore([0.9, 0.6, 0.4, 0.1], 0.5)).toBeCloseTo(0.5);
  });

  it("counts a score exactly at the threshold", () => {
    expect(confidenceScore([0.5, 0.5], 0.5)).toBe(1);
  });

  it("is 0 when no match meets the threshold", () => {
    expect(confidenceScore([0.1, 0.2], 0.5)).toBe(0);
  });
});

describe("freshnessScore", () => {
  it("is 0 for an empty list", () => {
    expect(freshnessScore([], Date.now(), 90)).toBe(0);
  });

  it("is ~1 for a just-crawled page", () => {
    const now = 1_000_000_000_000;
    expect(freshnessScore([now], now, 90)).toBeCloseTo(1);
  });

  it("is ~0.5 at one half-life of age", () => {
    const now = 1_000_000_000_000;
    const oneHalfLifeAgo = now - 90 * DAY_MS;
    expect(freshnessScore([oneHalfLifeAgo], now, 90)).toBeCloseTo(0.5, 5);
  });

  it("decays toward 0 for a very old page", () => {
    const now = 1_000_000_000_000;
    const veryOld = now - 3650 * DAY_MS; // ~10 years
    expect(freshnessScore([veryOld], now, 90)).toBeLessThan(0.01);
  });

  it("uses the most-recent crawl time among the cited pages", () => {
    const now = 1_000_000_000_000;
    const old = now - 365 * DAY_MS;
    const recent = now - 1 * DAY_MS;
    // Mixing an old and a recent page scores like the recent one (the max).
    expect(freshnessScore([old, recent], now, 90)).toBeCloseTo(freshnessScore([recent], now, 90));
  });

  it("clamps a future crawl time (negative age) to 1", () => {
    const now = 1_000_000_000_000;
    const future = now + 10 * DAY_MS;
    expect(freshnessScore([future], now, 90)).toBe(1);
  });
});
