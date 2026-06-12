import { describe, expect, it } from "vitest";
import { cleanExtracted } from "../src/lib/clean-content.ts";
import type { ExtractedContent, ExtractedSection } from "../src/lib/extract.ts";
import type { TextBlock } from "../src/lib/chunking.ts";
import { getSource } from "../src/lib/sources.ts";

function block(text: string, headingPath: string | null = null): TextBlock {
  return { text, headingPath };
}

function section(heading: string, ord: number, headingPath: string = heading): ExtractedSection {
  return { ord, level: 2, heading, anchor: null, headingPath };
}

function extracted(blocks: TextBlock[], sections: ExtractedSection[] = []): ExtractedContent {
  return { title: "T", sections, blocks, links: [], images: [] };
}

function texts(c: ExtractedContent): string[] {
  return c.blocks.map((b) => b.text);
}

describe("cleanExtracted — pure logic", () => {
  it("returns the input unchanged when no clean config is given", () => {
    const input = extracted([block("Ad placeholder"), block("real", "H")]);
    expect(cleanExtracted(input, undefined)).toBe(input);
  });

  it("drops blocks matching a dropBlockPattern, keeps the rest", () => {
    const input = extracted([block("Ad placeholder"), block("Astarion is a vampire.", "Overview")]);
    const out = cleanExtracted(input, { dropBlockPatterns: [/^Ad placeholder$/i] });
    expect(texts(out)).toEqual(["Astarion is a vampire."]);
  });

  it("truncates blocks AND sections at the first matching heading (everything after goes)", () => {
    const input = extracted(
      [
        block("intro", null),
        block("body", "Spells"),
        block("see also link", "Baldur's Gate 3 Related Guides"),
        block("later section text", "Comments"),
      ],
      [section("Spells", 0), section("Baldur's Gate 3 Related Guides", 1), section("Comments", 2)],
    );
    const out = cleanExtracted(input, { truncateAfterHeadings: ["Related Guides"] });
    expect(texts(out)).toEqual(["intro", "body"]);
    expect(out.sections.map((s) => s.heading)).toEqual(["Spells"]);
  });

  it("does not truncate when no heading matches", () => {
    const input = extracted([block("a", "Spells")], [section("Spells", 0)]);
    const out = cleanExtracted(input, { truncateAfterHeadings: ["Related Guides"] });
    expect(texts(out)).toEqual(["a"]);
    expect(out.sections).toHaveLength(1);
  });

  it("keeps ordinary content untouched", () => {
    const input = extracted([block("A normal paragraph about Gale.", "Overview")]);
    const out = cleanExtracted(input, {
      dropBlockPatterns: [/^Ad placeholder$/i],
      truncateAfterHeadings: ["Related Guides"],
    });
    expect(texts(out)).toEqual(["A normal paragraph about Gale."]);
  });

  it("drops a whole section (and its subsections) by heading, anywhere in the doc", () => {
    const input = extracted(
      [
        block("promo line", "What can you do as a free member?"),
        block("tool blurb", "What can you do as a free member? > Game Tools"),
        block("real spell text", "Overview"),
      ],
      [
        section("What can you do as a free member?", 0),
        section("Game Tools", 1, "What can you do as a free member? > Game Tools"),
        section("Overview", 2),
      ],
    );
    const out = cleanExtracted(input, {
      dropSectionsByHeading: ["What can you do as a free member?"],
    });
    expect(texts(out)).toEqual(["real spell text"]);
    expect(out.sections.map((s) => s.heading)).toEqual(["Overview"]);
  });
});

describe("cleanExtracted — real per-source catalog configs", () => {
  it("bg3-wiki drops the 'Ad placeholder' chunk-zero block", () => {
    const clean = getSource("bg3-wiki")?.clean;
    const out = cleanExtracted(
      extracted([block("Ad placeholder"), block("Shadowheart is a cleric.", "Overview")]),
      clean,
    );
    expect(texts(out)).toEqual(["Shadowheart is a cleric."]);
  });

  it("fextralife drops the multi-block nav labels, keeps article text", () => {
    const clean = getSource("fextralife")?.clean;
    const navLabels = [
      "Home",
      "Wikis",
      "News",
      "Reviews",
      "Guides",
      "Forum",
      "Sign In Now",
      "Recent Changes",
      "New page",
      "File Manager",
      "Members",
      "Page Manager",
      "Settings",
      "Create Wiki",
    ];
    const out = cleanExtracted(
      extracted([...navLabels.map((t) => block(t)), block("Rozes is a tiefling.", "Overview")]),
      clean,
    );
    expect(texts(out)).toEqual(["Rozes is a tiefling."]);
  });

  it("game8 drops the promo blocks and truncates at Related Guides", () => {
    const clean = getSource("game8")?.clean;
    const out = cleanExtracted(
      extracted(
        [
          block(
            "Want more information?Learn more",
            "What can you do as a free member? > Game Tools",
          ),
          block(
            "Become a paid member for full game tools.",
            "What can you do as a free member? > Game Tools",
          ),
          block(
            "★ All Updates for Patch 5☆ Beginner Guides for All Starter Players★ Simple Character Creation Guide",
            "Promo",
          ),
          block("Vengeance Paladins gain access to...", "Overview"),
          block("see the related guides", "Baldur's Gate 3 Related Guides"),
        ],
        [
          section("What can you do as a free member?", 0),
          section("Game Tools", 1, "What can you do as a free member? > Game Tools"),
          section("Overview", 2),
          section("Baldur's Gate 3 Related Guides", 3),
        ],
      ),
      clean,
    );
    expect(texts(out)).toEqual(["Vengeance Paladins gain access to..."]);
    expect(out.sections.map((s) => s.heading)).toEqual(["Overview"]);
  });
});
