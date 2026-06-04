import { describe, expect, it } from "vitest";
import {
  buildVectorFilter,
  rowPasses,
  toFtsQuery,
  type FilterableRow,
} from "../src/lib/search-filters.ts";

describe("buildVectorFilter", () => {
  it("returns an empty spec when filters are undefined", () => {
    expect(buildVectorFilter(undefined)).toEqual({});
  });

  it("maps each filter field to the matching Vectorize operator", () => {
    const spec = buildVectorFilter({
      pageTypes: ["spell", "item"],
      tiersMax: 2,
      language: "en",
      lifecycle: "active",
      freshnessAfter: 1000,
    });
    expect(spec.filter).toEqual({
      page_type: { $in: ["spell", "item"] },
      source_tier: { $lte: 2 },
      language: "en",
      lifecycle: "active",
      crawled_at: { $gte: 1000 },
    });
    expect(spec.namespace).toBeUndefined();
  });

  it("sets a namespace shortcut only for a single page type", () => {
    expect(buildVectorFilter({ pageTypes: ["spell"] }).namespace).toBe("spell");
  });

  it("produces no filter object when every field is empty", () => {
    const spec = buildVectorFilter({ pageTypes: [] });
    expect(spec.filter).toBeUndefined();
    expect(spec.namespace).toBeUndefined();
  });
});

const base: FilterableRow = {
  pageType: "spell",
  sourceTier: 1,
  language: "en",
  lifecycle: "active",
  crawledAt: 5000,
};

describe("rowPasses", () => {
  it("passes everything when no filters are given", () => {
    expect(rowPasses(base, undefined)).toBe(true);
  });

  it("rejects on each dimension independently", () => {
    expect(rowPasses(base, { pageTypes: ["item"] })).toBe(false);
    expect(rowPasses({ ...base, sourceTier: 2 }, { tiersMax: 1 })).toBe(false);
    expect(rowPasses(base, { language: "de" })).toBe(false);
    expect(rowPasses(base, { lifecycle: "deprecated" })).toBe(false);
    expect(rowPasses(base, { freshnessAfter: 9000 })).toBe(false);
  });

  it("accepts a row meeting all constraints", () => {
    expect(
      rowPasses(base, {
        pageTypes: ["spell"],
        tiersMax: 1,
        language: "en",
        lifecycle: "active",
        freshnessAfter: 1000,
      }),
    ).toBe(true);
  });

  it("treats an empty pageTypes array as no page-type constraint", () => {
    expect(rowPasses(base, { pageTypes: [] })).toBe(true);
  });
});

describe("toFtsQuery", () => {
  it("lowercases and keeps only alphanumeric terms", () => {
    expect(toFtsQuery("Fireball (3rd-level)!")).toBe("fireball 3rd level");
  });

  it("returns an empty string when nothing is searchable", () => {
    expect(toFtsQuery("!!! @#$ %^&")).toBe("");
  });
});
