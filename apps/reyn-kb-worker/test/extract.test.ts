import { describe, expect, it } from "vitest";
import { extractContent } from "../src/lib/extract.ts";

const HTML = `<html><head><title>Fireball - BG3 Wiki</title><style>.x{}</style></head>
<body>
<nav><a href="/home">Home</a></nav>
<h1 id="top">Fireball</h1>
<p>A <a href="/wiki/Wizard">Wizard</a> spell. Deals fire damage.</p>
<h2 id="higher">At Higher Levels</h2>
<p>Add 1d6 per slot above 3rd.</p>
<h3></h3>
<p>See <a id="ref">reference</a> here.</p>
<img src="/img/fireball.png" alt="Fireball icon">
<img alt="decorative">
<script>evil()</script>
<footer>(c) Larian</footer>
</body></html>`;

describe("extractContent (HTMLRewriter)", () => {
  it("captures title, heading hierarchy, blocks, links, and images", async () => {
    const r = await extractContent(HTML);

    expect(r.title).toBe("Fireball - BG3 Wiki");

    // Sections: the empty <h3> produces no section; h1 then h2 nest.
    expect(r.sections.map((s) => s.headingPath)).toEqual([
      "Fireball",
      "Fireball > At Higher Levels",
    ]);
    expect(r.sections[0]!.anchor).toBe("top");
    expect(r.sections[1]!.level).toBe(2);

    // Blocks tagged with their section path; nav/footer/script excluded.
    const firstBlock = r.blocks.find((b) => b.text.includes("Wizard spell"))!;
    expect(firstBlock.headingPath).toBe("Fireball");
    const higherBlock = r.blocks.find((b) => b.text.includes("Add 1d6"))!;
    expect(higherBlock.headingPath).toBe("Fireball > At Higher Levels");
    const allText = r.blocks.map((b) => b.text).join(" ");
    expect(allText).not.toContain("Larian");
    expect(allText).not.toContain("evil");

    // Links: in-content link captured with its text; nav (dropped) link is not;
    // the href-less anchor produces no link.
    const hrefs = r.links.map((l) => l.href);
    expect(hrefs).toContain("/wiki/Wizard");
    expect(hrefs).not.toContain("/home");
    expect(r.links.find((l) => l.href === "/wiki/Wizard")!.text).toBe("Wizard");
    expect(r.links).toHaveLength(1);

    // Images: only the one with a src.
    expect(r.images).toEqual([{ src: "/img/fireball.png", alt: "Fireball icon" }]);
  });

  it("drops MediaWiki chrome (edit-section, navbox, reference list, link-dense list items) but keeps editorial links + tables/prose", async () => {
    const html = `<html><head><title>T</title></head><body>
<h1 id="top">Topic</h1>
<p class="mw-content-text">Real <a href="/wiki/Body">body</a> prose about the topic, mostly plain text.</p>
<div role="navigation"><a href="/wiki/RoleNav">rolenav link</a></div>
<h2 id="see">See also<span class="mw-editsection">[<a href="/edit">edit</a> | <a href="/ve">visual editor</a>]</span></h2>
<ul><li><a href="/wiki/Related_One">Related One</a></li><li><a href="/wiki/Related_Two">Related Two</a></li></ul>
<h2 id="ext">External links</h2>
<ul><li><a href="https://example.com/x">Example offsite</a></li></ul>
<h2 id="ref">References</h2>
<ol class="references"><li><a href="https://cite.example/1">Some citation source text</a></li></ol>
<table><tr><td><a href="/wiki/Fireball">Fireball</a></td><td>3rd level</td><td>8d6 fire</td></tr></table>
<div class="navbox"><a href="/wiki/Nav1">v</a> <a href="/wiki/Nav2">t</a> <a href="/wiki/Nav3">e</a> Subclasses</div>
</body></html>`;
    const r = await extractContent(html);
    const blockText = r.blocks.map((b) => b.text).join(" | ");
    const hrefs = r.links.map((l) => l.href);

    // (B) edit-section links stripped from the heading and never recorded as links.
    expect(r.sections.map((s) => s.heading)).toContain("See also");
    expect(r.sections.map((s) => s.heading)).not.toContain("See also[edit | visual editor]");
    expect(hrefs).not.toContain("/edit");
    expect(hrefs).not.toContain("/ve");

    // (A) link-dense list items dropped from chunk text, but internal links kept as edges.
    expect(blockText).not.toContain("Related One");
    expect(blockText).not.toContain("Example offsite");
    expect(hrefs).toContain("/wiki/Related_One");
    expect(hrefs).toContain("/wiki/Related_Two");
    expect(hrefs).toContain("https://example.com/x");

    // (references) citation list dropped wholesale — text AND link.
    expect(blockText).not.toContain("citation source");
    expect(hrefs).not.toContain("https://cite.example/1");

    // (C) navbox + role="navigation" dropped wholesale — text AND links.
    expect(blockText).not.toContain("Subclasses");
    expect(hrefs).not.toContain("/wiki/Nav1");
    expect(blockText).not.toContain("rolenav link");
    expect(hrefs).not.toContain("/wiki/RoleNav");

    // Content preserved: prose block and TABLE cells (even a link-only cell) kept.
    expect(blockText).toContain("body prose about the topic");
    expect(blockText).toContain("Fireball");
    expect(blockText).toContain("8d6 fire");
    expect(hrefs).toContain("/wiki/Body");
    expect(hrefs).toContain("/wiki/Fireball");
  });

  it("returns nulls/empties for blank input", async () => {
    const r = await extractContent("<html><body><p>   </p></body></html>");
    expect(r.title).toBeNull();
    expect(r.blocks).toEqual([]);
    expect(r.sections).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.images).toEqual([]);
  });
});
