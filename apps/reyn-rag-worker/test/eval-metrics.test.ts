import { describe, expect, it } from "vitest";
import {
  retrievalHitRate,
  citationScores,
  groundedProxy,
  aggregate,
} from "../src/lib/eval-metrics.ts";

// ---------------------------------------------------------------------------
// retrievalHitRate
// ---------------------------------------------------------------------------

describe("retrievalHitRate", () => {
  it("returns 1 when expectedUrls is empty (trivially satisfied)", () => {
    expect(retrievalHitRate([], [])).toBe(1);
    expect(retrievalHitRate([], ["https://bg3.wiki/wiki/Shadowheart"])).toBe(1);
  });

  it("returns 0 when nothing expected was cited", () => {
    expect(
      retrievalHitRate(["https://bg3.wiki/wiki/Shadowheart"], ["https://bg3.wiki/wiki/Karlach"]),
    ).toBe(0);
  });

  it("returns 0 when citationUrls is empty and expected is non-empty", () => {
    expect(retrievalHitRate(["https://bg3.wiki/wiki/Shadowheart"], [])).toBe(0);
  });

  it("returns 1 when all expected URLs are cited", () => {
    const expected = ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Karlach"];
    const cited = [
      "https://bg3.wiki/wiki/Karlach",
      "https://bg3.wiki/wiki/Shadowheart",
      "https://bg3.wiki/wiki/Lae%27zel",
    ];
    expect(retrievalHitRate(expected, cited)).toBe(1);
  });

  it("returns the fraction of expected URLs found", () => {
    const expected = [
      "https://bg3.wiki/wiki/Shadowheart",
      "https://bg3.wiki/wiki/Karlach",
      "https://bg3.wiki/wiki/Gale",
    ];
    const cited = ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Gale"];
    expect(retrievalHitRate(expected, cited)).toBeCloseTo(2 / 3);
  });

  it("treats duplicates in either list as a single entry", () => {
    expect(
      retrievalHitRate(
        ["https://bg3.wiki/wiki/Astarion", "https://bg3.wiki/wiki/Astarion"],
        ["https://bg3.wiki/wiki/Astarion"],
      ),
    ).toBe(1);
    expect(
      retrievalHitRate(
        ["https://bg3.wiki/wiki/Astarion", "https://bg3.wiki/wiki/Gale"],
        ["https://bg3.wiki/wiki/Astarion", "https://bg3.wiki/wiki/Astarion"],
      ),
    ).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// citationScores
// ---------------------------------------------------------------------------

describe("citationScores", () => {
  it("both empty: precision 0, recall 1 (IR convention)", () => {
    const result = citationScores([], []);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(1);
  });

  it("empty expected, some cited: precision 0, recall 1", () => {
    const result = citationScores([], ["https://bg3.wiki/wiki/Shadowheart"]);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(1);
  });

  it("non-empty expected, no citations: precision 0, recall 0", () => {
    const result = citationScores(["https://bg3.wiki/wiki/Shadowheart"], []);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });

  it("all cited are relevant, all expected are cited → precision 1, recall 1", () => {
    const urls = ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Karlach"];
    const result = citationScores(urls, urls);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
  });

  it("cited superset of expected: precision < 1, recall 1", () => {
    const result = citationScores(
      ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Karlach"],
      [
        "https://bg3.wiki/wiki/Shadowheart",
        "https://bg3.wiki/wiki/Karlach",
        "https://bg3.wiki/wiki/Gale",
      ],
    );
    expect(result.precision).toBeCloseTo(2 / 3);
    expect(result.recall).toBe(1);
  });

  it("expected superset of cited: precision 1, recall < 1", () => {
    const result = citationScores(
      [
        "https://bg3.wiki/wiki/Shadowheart",
        "https://bg3.wiki/wiki/Karlach",
        "https://bg3.wiki/wiki/Gale",
      ],
      ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Karlach"],
    );
    expect(result.precision).toBe(1);
    expect(result.recall).toBeCloseTo(2 / 3);
  });

  it("no overlap: precision 0, recall 0", () => {
    const result = citationScores(
      ["https://bg3.wiki/wiki/Shadowheart"],
      ["https://bg3.wiki/wiki/Karlach"],
    );
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });

  it("partial overlap: correct fractions", () => {
    const result = citationScores(
      ["https://a.example/A", "https://a.example/B", "https://a.example/C"],
      ["https://a.example/A", "https://a.example/D"],
    );
    expect(result.precision).toBe(0.5);
    expect(result.recall).toBeCloseTo(1 / 3);
  });

  it("duplicates in either list don't inflate counts", () => {
    const result = citationScores(
      ["https://bg3.wiki/wiki/Shadowheart"],
      ["https://bg3.wiki/wiki/Shadowheart", "https://bg3.wiki/wiki/Shadowheart"],
    );
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// groundedProxy
// ---------------------------------------------------------------------------

describe("groundedProxy", () => {
  it("returns false for empty answer with 0 citations", () => {
    expect(groundedProxy("", 0)).toBe(false);
  });

  it("returns false for empty answer even with citations", () => {
    expect(groundedProxy("", 3)).toBe(false);
  });

  it("returns false for whitespace-only answer", () => {
    expect(groundedProxy("   \n  ", 2)).toBe(false);
  });

  it("returns false for non-empty answer with 0 citations", () => {
    expect(groundedProxy("Shadowheart is a cleric.", 0)).toBe(false);
  });

  it("returns true for non-empty answer with at least 1 citation", () => {
    expect(groundedProxy("Shadowheart is a cleric.", 1)).toBe(true);
    expect(groundedProxy("Some answer.", 5)).toBe(true);
  });

  it("is documented as a proxy only, not a hallucination detector", () => {
    expect(groundedProxy("This is completely fabricated content.", 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

describe("aggregate", () => {
  it("returns all zeros with n=0 for empty input", () => {
    const result = aggregate([]);
    expect(result).toEqual({
      meanHitRate: 0,
      meanPrecision: 0,
      meanRecall: 0,
      groundedRate: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      n: 0,
    });
  });

  it("aggregates a single item correctly", () => {
    const result = aggregate([
      { hitRate: 0.8, precision: 0.75, recall: 0.6, grounded: true, latencyMs: 200 },
    ]);
    expect(result.meanHitRate).toBeCloseTo(0.8);
    expect(result.meanPrecision).toBeCloseTo(0.75);
    expect(result.meanRecall).toBeCloseTo(0.6);
    expect(result.groundedRate).toBe(1);
    expect(result.p50LatencyMs).toBe(200);
    expect(result.p95LatencyMs).toBe(200);
    expect(result.n).toBe(1);
  });

  it("computes means correctly across multiple items", () => {
    const result = aggregate([
      { hitRate: 1.0, precision: 1.0, recall: 1.0, grounded: true, latencyMs: 100 },
      { hitRate: 0.0, precision: 0.0, recall: 0.0, grounded: false, latencyMs: 300 },
    ]);
    expect(result.meanHitRate).toBeCloseTo(0.5);
    expect(result.meanPrecision).toBeCloseTo(0.5);
    expect(result.meanRecall).toBeCloseTo(0.5);
    expect(result.groundedRate).toBeCloseTo(0.5);
    expect(result.n).toBe(2);
  });

  it("groundedRate is 0 when no items are grounded", () => {
    const result = aggregate([
      { hitRate: 0, precision: 0, recall: 0, grounded: false, latencyMs: 50 },
      { hitRate: 0, precision: 0, recall: 0, grounded: false, latencyMs: 60 },
    ]);
    expect(result.groundedRate).toBe(0);
  });

  it("groundedRate is 1 when all items are grounded", () => {
    const result = aggregate([
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 100 },
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 150 },
    ]);
    expect(result.groundedRate).toBe(1);
  });

  it("computes p50 and p95 latency percentiles correctly", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      hitRate: 1,
      precision: 1,
      recall: 1,
      grounded: true,
      latencyMs: (i + 1) * 100,
    }));
    const result = aggregate(items);
    expect(result.p50LatencyMs).toBe(500);
    expect(result.p95LatencyMs).toBe(1000);
    expect(result.n).toBe(10);
  });

  it("sorts latencies before computing percentiles", () => {
    const items = [
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 900 },
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 100 },
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 500 },
    ];
    const result = aggregate(items);
    expect(result.p50LatencyMs).toBe(500);
    expect(result.p95LatencyMs).toBe(900);
  });

  it("p50 == p95 for a single-item list", () => {
    const result = aggregate([
      { hitRate: 1, precision: 1, recall: 1, grounded: true, latencyMs: 42 },
    ]);
    expect(result.p50LatencyMs).toBe(42);
    expect(result.p95LatencyMs).toBe(42);
  });
});
