import { describe, expect, it } from "vitest";
import {
  runNormalize,
  canonicalizeUrl,
  collapseWhitespace,
  firstParagraph,
} from "../src/rules/normalize.ts";
import type { PageCandidate, RuleSpec } from "../src/rules/types.ts";

function candidate(over: Partial<PageCandidate> = {}): PageCandidate {
  return {
    url: "https://bg3.wiki/Fireball?utm_source=x#top",
    canonicalUrl: "https://bg3.wiki/Fireball?utm_source=x#top",
    title: "Fireball",
    text: "First para.\n\nSecond para.",
    pageType: "spell",
    language: "en",
    summary: null,
    tags: [],
    ...over,
  };
}

function spec(kind: string, params: unknown = {}): RuleSpec {
  return {
    id: `r-${kind}`,
    phase: "normalize",
    kind,
    scope: "all",
    params,
    severity: "error",
    priority: 100,
  };
}

describe("rules/normalize helpers", () => {
  it("canonicalizeUrl strips params, lowercases host, drops fragment", () => {
    expect(
      canonicalizeUrl("https://BG3.Wiki/Fireball?utm_source=x&keep=1#frag", {
        stripParams: ["utm_source"],
        lowercaseHost: true,
        dropFragment: true,
      }),
    ).toBe("https://bg3.wiki/Fireball?keep=1");
  });

  it("keeps the fragment when dropFragment is off (host is always lowercased by URL parsing)", () => {
    expect(
      canonicalizeUrl("https://Bg3.Wiki/A#x", {
        stripParams: [],
        lowercaseHost: false,
        dropFragment: false,
      }),
    ).toBe("https://bg3.wiki/A#x");
  });

  it("canonicalizeUrl returns null on an unparseable url", () => {
    expect(
      canonicalizeUrl("not a url", { stripParams: [], lowercaseHost: true, dropFragment: true }),
    ).toBeNull();
  });

  it("collapseWhitespace tidies intra-line runs and blank-line runs", () => {
    expect(collapseWhitespace("a  b \n\n\n\nc  ")).toBe("a b\n\nc");
  });

  it("firstParagraph skips leading blanks and truncates", () => {
    expect(firstParagraph("\n\nHello world.\n\nNext", 5)).toBe("Hello");
    expect(firstParagraph("   \n  ", 50)).toBe("");
  });
});

describe("runNormalize", () => {
  it("applies canonical_url + derive_summary, reports a no-op collapse as skipped", () => {
    const rules = [
      spec("canonical_url", { stripParams: ["utm_source"] }),
      spec("collapse_whitespace"),
      spec("derive_summary"),
    ];
    const { candidate: out, outcomes } = runNormalize(rules, candidate());
    expect(out.canonicalUrl).toBe("https://bg3.wiki/Fireball");
    expect(out.summary).toBe("First para.");
    expect(outcomes.map((o) => o.status)).toEqual(["applied", "skipped", "applied"]);
    expect(outcomes[0]!.detail).toBe("https://bg3.wiki/Fireball");
  });

  it("treats an unparseable url + already-set summary as no-ops, and flags non-normalize kinds", () => {
    const { candidate: out, outcomes } = runNormalize(
      [spec("canonical_url"), spec("derive_summary"), spec("require_title")],
      candidate({ url: "::bad::", canonicalUrl: "::bad::", summary: "preset" }),
    );
    expect(out.summary).toBe("preset");
    expect(outcomes[0]!.status).toBe("skipped"); // canonical_url no-op (unparseable)
    expect(outcomes[1]!.status).toBe("skipped"); // summary already set
    expect(outcomes[2]!.status).toBe("skipped");
    expect(outcomes[2]!.detail).toBe("not a normalize rule");
  });
});
