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

  it("returns nulls/empties for blank input", async () => {
    const r = await extractContent("<html><body><p>   </p></body></html>");
    expect(r.title).toBeNull();
    expect(r.blocks).toEqual([]);
    expect(r.sections).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.images).toEqual([]);
  });
});
