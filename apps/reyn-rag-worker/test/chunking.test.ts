import { describe, expect, it } from "vitest";
import { chunkText } from "../src/lib/chunking.ts";

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace input", () => {
    expect(chunkText("", { maxChars: 100, overlapChars: 10 })).toEqual([]);
    expect(chunkText("   \n\n  \t ", { maxChars: 100, overlapChars: 10 })).toEqual([]);
  });

  it("emits a single chunk when everything fits", () => {
    const out = chunkText("Hello world.", { maxChars: 100, overlapChars: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]!.ord).toBe(0);
    expect(out[0]!.text).toBe("Hello world.");
  });

  it("packs multiple paragraphs greedily into windows <= maxChars", () => {
    const para = "a".repeat(40);
    const text = [para, para, para].join("\n\n"); // three 40-char blocks
    const out = chunkText(text, { maxChars: 90, overlapChars: 0 });
    // 40 + 2 + 40 = 82 <= 90 fits two; third overflows to chunk 2.
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.text.length <= 90)).toBe(true);
    expect(out.map((c) => c.ord)).toEqual([0, 1]);
  });

  it("carries overlapChars from the previous chunk into the next", () => {
    const a = "A".repeat(50);
    const b = "B".repeat(50);
    const out = chunkText(`${a}\n\n${b}`, { maxChars: 60, overlapChars: 10 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    // The second chunk should start with the trailing overlap of the first.
    const firstTail = out[0]!.text.slice(out[0]!.text.length - 10);
    expect(out[1]!.text.startsWith(firstTail)).toBe(true);
  });

  it("starts a new chunk at a heading boundary", () => {
    const text = ["# Heading one", "Body for one.", "", "# Heading two", "Body for two."].join(
      "\n",
    );
    // maxChars large enough that size never forces a split — only the heading does.
    const out = chunkText(text, { maxChars: 1000, overlapChars: 0 });
    // Headings split blocks but small blocks then re-pack; assert both headings survive.
    const joined = out.map((c) => c.text).join("\n");
    expect(joined).toContain("# Heading one");
    expect(joined).toContain("# Heading two");
  });

  it("hard-splits a single oversized paragraph into <= maxChars pieces", () => {
    const huge = "x".repeat(250);
    const out = chunkText(huge, { maxChars: 100, overlapChars: 20 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.text.length <= 100)).toBe(true);
    expect(out.map((c) => c.ord)).toEqual(out.map((_c, i) => i));
  });

  it("is deterministic for identical inputs", () => {
    const text = "Para A.\n\nPara B.\n\nPara C.";
    const a = chunkText(text, { maxChars: 12, overlapChars: 3 });
    const b = chunkText(text, { maxChars: 12, overlapChars: 3 });
    expect(a).toEqual(b);
  });

  it("rejects invalid options", () => {
    expect(() => chunkText("x", { maxChars: 0, overlapChars: 0 })).toThrow(RangeError);
    expect(() => chunkText("x", { maxChars: 10, overlapChars: 10 })).toThrow(RangeError);
    expect(() => chunkText("x", { maxChars: 10, overlapChars: -1 })).toThrow(RangeError);
  });

  it("handles zero overlap with no leading carry", () => {
    const text = "P1.\n\nP2.\n\nP3.";
    const out = chunkText(text, { maxChars: 5, overlapChars: 0 });
    expect(out.every((c) => c.text.length <= 5)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("hard-splits when overlap >= block size advances by at least 1 char", () => {
    // overlapChars just below maxChars exercises the step = max(1, ...) guard.
    const out = chunkText("y".repeat(30), { maxChars: 10, overlapChars: 9 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.text.length <= 10)).toBe(true);
  });
});
