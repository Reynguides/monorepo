import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "../src/lib/html-entities.ts";

describe("decodeHtmlEntities", () => {
  it("decodes decimal numeric entities", () => {
    expect(decodeHtmlEntities("Baldur&#39;s Gate")).toBe("Baldur's Gate");
  });

  it("decodes hex numeric entities (either case of the x)", () => {
    expect(decodeHtmlEntities("Baldur&#x27;s &#X2014; end")).toBe("Baldur's — end");
  });

  it("decodes markup named entities", () => {
    expect(decodeHtmlEntities("a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;")).toBe(
      "a & b < c > d \"e\" 'f'",
    );
  });

  it("decodes &nbsp; to U+00A0 (collapse() in extract.ts later normalizes it to a space)", () => {
    expect(decodeHtmlEntities("non&nbsp;break")).toBe("non break");
  });

  it("decodes typography, symbols, currency, arrows, and math entities", () => {
    expect(decodeHtmlEntities("&rsquo;&ldquo;&rdquo;&mdash;&ndash;&hellip;&bull;")).toBe("’“”—–…•");
    expect(decodeHtmlEntities("2&times;3&divide;4 90&deg; &plusmn;1 &frac12;")).toBe(
      "2×3÷4 90° ±1 ½",
    );
    expect(decodeHtmlEntities("&copy;&reg;&trade; &euro;5 &pound;3")).toBe("©®™ €5 £3");
    expect(decodeHtmlEntities("a&rarr;b &le;5 &ge;1 &ne;0 &infin;")).toBe("a→b ≤5 ≥1 ≠0 ∞");
  });

  it("is case-sensitive for named entities (&dagger; vs &Dagger;)", () => {
    expect(decodeHtmlEntities("&dagger;&Dagger;")).toBe("†‡");
  });

  it("leaves unmapped / unknown named entities untouched", () => {
    expect(decodeHtmlEntities("&alpha; &notreal; x")).toBe("&alpha; &notreal; x");
  });

  it("leaves a lone ampersand and malformed refs untouched", () => {
    expect(decodeHtmlEntities("Tom & Jerry, A&B, &;")).toBe("Tom & Jerry, A&B, &;");
  });

  it("leaves out-of-range / zero numeric code points untouched", () => {
    expect(decodeHtmlEntities("&#1114112; &#0;")).toBe("&#1114112; &#0;");
  });

  it("is a no-op on entity-free text and the empty string", () => {
    expect(decodeHtmlEntities("Just plain text.")).toBe("Just plain text.");
    expect(decodeHtmlEntities("")).toBe("");
  });

  it("decodes a single pass only (does not re-scan its own output)", () => {
    // &amp;#39; → &#39; in ONE pass — the replacement is not re-examined.
    expect(decodeHtmlEntities("&amp;#39;")).toBe("&#39;");
  });
});
