import { describe, expect, it } from "vitest";
import { cleanHtml } from "../src/lib/html-clean.ts";

describe("cleanHtml", () => {
  it("extracts the title, decoded + trimmed", () => {
    const out = cleanHtml(
      "<html><head><title>  Astarion &amp; Co  </title></head><body><p>x</p></body></html>",
    );
    expect(out.title).toBe("Astarion & Co");
  });

  it("returns undefined title when absent", () => {
    expect(cleanHtml("<p>no title here</p>").title).toBeUndefined();
  });

  it("returns undefined title when the title is empty/whitespace", () => {
    expect(cleanHtml("<title>   </title><p>body</p>").title).toBeUndefined();
  });

  it("strips <script>, <style>, <head>, comments, noscript, and template", () => {
    const html = [
      "<head><title>T</title><style>.x{color:red}</style></head>",
      "<body>",
      "<script>alert('xss')</script>",
      "<noscript>enable js</noscript>",
      "<template><p>tmpl</p></template>",
      "<!-- a comment -->",
      "<p>Real content</p>",
      "</body>",
    ].join("");
    const out = cleanHtml(html);
    expect(out.text).toBe("Real content");
    expect(out.text).not.toContain("alert");
    expect(out.text).not.toContain("color:red");
    expect(out.text).not.toContain("enable js");
    expect(out.text).not.toContain("tmpl");
    expect(out.text).not.toContain("comment");
  });

  it("converts headings, paragraphs and list items to markdown", () => {
    const html = "<h1>Title</h1><h2>Sub</h2><p>Para one.</p><ul><li>a</li><li>b</li></ul>";
    const md = cleanHtml(html).markdown;
    expect(md).toContain("# Title");
    expect(md).toContain("## Sub");
    expect(md).toContain("Para one.");
    expect(md).toContain("- a");
    expect(md).toContain("- b");
  });

  it("converts deep headings h3-h6", () => {
    const md = cleanHtml("<h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>").markdown;
    expect(md).toContain("### Three");
    expect(md).toContain("#### Four");
    expect(md).toContain("##### Five");
    expect(md).toContain("###### Six");
  });

  it("converts links to markdown and degrades href-less / empty links", () => {
    const md = cleanHtml(
      '<p>See <a href="https://bg3.wiki/Karlach">Karlach</a> and <a>plain</a> and <a href="x"></a>.</p>',
    ).markdown;
    expect(md).toContain("[Karlach](https://bg3.wiki/Karlach)");
    expect(md).toContain("plain");
    expect(md).not.toContain("[plain]");
  });

  it("handles single-quoted and bare hrefs", () => {
    const md = cleanHtml("<a href='https://a.test'>q</a> <a href=https://b.test>b</a>").markdown;
    expect(md).toContain("[q](https://a.test)");
    expect(md).toContain("[b](https://b.test)");
  });

  it("decodes named, decimal, and hex entities; leaves unknown entities", () => {
    const out = cleanHtml("<p>a &amp; b &lt; c &gt; d &#65; e &#x42; f &nbsp;g &bogus;</p>");
    expect(out.text).toContain("a & b < c > d A e B f");
    expect(out.text).toContain("&bogus;");
  });

  it("collapses <br> into newlines and whitespace into single spaces", () => {
    const md = cleanHtml("<p>line1<br>line2</p><p>x    y\t\tz</p>").markdown;
    expect(md).toContain("line1\nline2");
    expect(md).toContain("x y z");
  });

  it("produces text with markdown markers stripped", () => {
    const out = cleanHtml("<h1>Head</h1><ul><li>item</li></ul><p>See <a href='u'>link</a></p>");
    expect(out.text).not.toContain("#");
    expect(out.text).not.toMatch(/\[link\]/);
    expect(out.text).toContain("Head");
    expect(out.text).toContain("item");
    expect(out.text).toContain("link");
  });

  it("returns empty markdown/text for empty or tag-only input", () => {
    const out = cleanHtml("<div></div>");
    expect(out.markdown).toBe("");
    expect(out.text).toBe("");
  });

  it("ignores numeric entities that are out of range", () => {
    const out = cleanHtml("<p>&#0; &#xZZ; ok</p>");
    expect(out.text).toContain("&#0;");
    // &#xZZ; is not a valid hex sequence so the entity regex never matches it.
    expect(out.text).toContain("ok");
  });
});
