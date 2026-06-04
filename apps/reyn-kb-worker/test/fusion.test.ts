import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, RRF_K } from "../src/lib/fusion.ts";

describe("reciprocalRankFusion", () => {
  it("scores a single list by 1/(k+rank), best-first", () => {
    const s = reciprocalRankFusion([["a", "b", "c"]]);
    expect(s.get("a")).toBeCloseTo(1 / (RRF_K + 1));
    expect(s.get("b")).toBeCloseTo(1 / (RRF_K + 2));
    expect(s.get("c")).toBeCloseTo(1 / (RRF_K + 3));
    expect(s.get("a")!).toBeGreaterThan(s.get("c")!);
  });

  it("sums contributions across lists; symmetric input yields symmetric scores", () => {
    const s = reciprocalRankFusion([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(s.get("a")).toBeCloseTo(s.get("b")!);
  });

  it("rewards an id present in both arms over one present in a single arm", () => {
    const s = reciprocalRankFusion([["x", "y"], ["x"]]);
    expect(s.get("x")!).toBeGreaterThan(s.get("y")!);
  });

  it("honours a custom k", () => {
    expect(reciprocalRankFusion([["a"]], 1).get("a")).toBeCloseTo(1 / 2);
  });

  it("returns an empty map for no lists and for empty lists", () => {
    expect(reciprocalRankFusion([]).size).toBe(0);
    expect(reciprocalRankFusion([[]]).size).toBe(0);
  });
});
