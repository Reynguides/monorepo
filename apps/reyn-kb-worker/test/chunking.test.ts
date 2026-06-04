import { describe, expect, it } from "vitest";
import { chunkBlocks, type TextBlock } from "../src/lib/chunking.ts";

describe("chunkBlocks", () => {
  it("returns no chunks for empty or whitespace-only blocks", () => {
    expect(chunkBlocks([], { maxChars: 100, overlapChars: 10 })).toEqual([]);
    expect(
      chunkBlocks([{ headingPath: "A", text: "   " }], { maxChars: 100, overlapChars: 10 }),
    ).toEqual([]);
  });

  it("packs consecutive same-path blocks and tags chunks with the heading path", () => {
    const blocks: TextBlock[] = [
      { headingPath: "Fireball", text: "alpha" },
      { headingPath: "Fireball", text: "beta" },
    ];
    const chunks = chunkBlocks(blocks, { maxChars: 100, overlapChars: 0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("alpha\n\nbeta");
    expect(chunks[0]!.headingPath).toBe("Fireball");
    expect(chunks[0]!.ord).toBe(0);
  });

  it("never spans sections — different heading paths become separate chunks", () => {
    const chunks = chunkBlocks(
      [
        { headingPath: "A", text: "one" },
        { headingPath: "B", text: "two" },
      ],
      { maxChars: 100, overlapChars: 0 },
    );
    expect(chunks.map((c) => c.headingPath)).toEqual(["A", "B"]);
    expect(chunks.map((c) => c.ord)).toEqual([0, 1]);
  });

  it("splits a block within a section once it exceeds maxChars", () => {
    const chunks = chunkBlocks(
      [
        { headingPath: "S", text: "a".repeat(80) },
        { headingPath: "S", text: "b".repeat(80) },
      ],
      { maxChars: 100, overlapChars: 0 },
    );
    expect(chunks.length).toBe(2);
    chunks.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(100));
  });

  it("hard-splits a single oversized block into <= maxChars pieces", () => {
    const chunks = chunkBlocks([{ headingPath: null, text: "x".repeat(250) }], {
      maxChars: 100,
      overlapChars: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(100));
  });

  it("rejects invalid options", () => {
    expect(() => chunkBlocks([], { maxChars: 0, overlapChars: 0 })).toThrow(RangeError);
    expect(() => chunkBlocks([], { maxChars: 100, overlapChars: 100 })).toThrow(RangeError);
  });
});
