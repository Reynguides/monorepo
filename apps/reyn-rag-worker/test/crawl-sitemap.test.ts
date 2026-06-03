import { describe, expect, it } from "vitest";
import { parseSitemap } from "../src/crawl/sitemap.ts";

describe("parseSitemap", () => {
  it("extracts loc URLs from a urlset, in document order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://bg3.wiki/A</loc><lastmod>2024-01-01</lastmod></url>
        <url><loc>https://bg3.wiki/B</loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://bg3.wiki/A", "https://bg3.wiki/B"]);
  });

  it("extracts loc URLs from a sitemapindex too", () => {
    const xml = `<sitemapindex>
        <sitemap><loc>https://bg3.wiki/sitemap-1.xml</loc></sitemap>
        <sitemap><loc>https://bg3.wiki/sitemap-2.xml</loc></sitemap>
      </sitemapindex>`;
    expect(parseSitemap(xml)).toEqual([
      "https://bg3.wiki/sitemap-1.xml",
      "https://bg3.wiki/sitemap-2.xml",
    ]);
  });

  it("tolerates namespace prefixes and surrounding whitespace", () => {
    const xml = `<ns:urlset><ns:url><ns:loc>
        https://bg3.wiki/Padded
      </ns:loc></ns:url></ns:urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://bg3.wiki/Padded"]);
  });

  it("decodes XML entities in URLs", () => {
    const xml = `<urlset><url><loc>https://bg3.wiki/q?a=1&amp;b=2</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://bg3.wiki/q?a=1&b=2"]);
  });

  it("drops empty / whitespace-only loc values", () => {
    const xml = `<urlset>
        <url><loc></loc></url>
        <url><loc>   </loc></url>
        <url><loc>https://bg3.wiki/Real</loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://bg3.wiki/Real"]);
  });

  it("returns [] for empty or malformed input", () => {
    expect(parseSitemap("")).toEqual([]);
    expect(parseSitemap("not xml at all")).toEqual([]);
    expect(parseSitemap("<urlset><url><loc>unterminated")).toEqual([]);
  });

  it("matches namespace-prefixed loc tags (incl. image:loc), leaving host-filtering to callers", () => {
    const xml = `<urlset><url>
        <loc>https://bg3.wiki/Page</loc>
        <image:image><image:loc>https://cdn.other.test/pic.png</image:loc></image:image>
      </url></urlset>`;
    // The namespace-tolerant regex extracts image:loc too; the pipeline's
    // same-host SSRF filter drops any off-host loc downstream.
    expect(parseSitemap(xml)).toEqual(["https://bg3.wiki/Page", "https://cdn.other.test/pic.png"]);
  });
});
