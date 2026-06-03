/**
 * Minimal sitemap XML parser. Pure + dependency-free (no XML lib in the Worker
 * runtime): a regex extracts every `<loc>…</loc>` value, which covers both a
 * `<urlset>` (page URLs) and a `<sitemapindex>` (child-sitemap URLs) — callers
 * decide whether the locs are pages or sub-sitemaps. Tolerates namespace
 * prefixes (`<image:loc>` is intentionally NOT matched — only `<loc>`),
 * surrounding whitespace, and a leading XML declaration.
 */

// Matches <loc>…</loc> allowing an optional namespace prefix on the tag
// (e.g. <ns:loc>), attributes, and arbitrary inner whitespace. `[\s\S]` so the
// value may span newlines; the inner group is captured then trimmed.
const LOC_RE = /<(?:[a-zA-Z][\w.-]*:)?loc\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z][\w.-]*:)?loc\s*>/gi;

/**
 * Extract all `<loc>` URLs from a sitemap or sitemap-index XML document.
 * Returns them in document order. Empty/whitespace-only locs are dropped.
 * Malformed or empty input yields `[]` (never throws).
 */
export function parseSitemap(xml: string): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(LOC_RE)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const url = decodeXmlEntities(raw.trim());
    if (url.length > 0) {
      out.push(url);
    }
  }
  return out;
}

/** Decode the five predefined XML entities that may appear in a sitemap URL. */
function decodeXmlEntities(s: string): string {
  return (
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // Ampersand last so a literal "&amp;lt;" decodes to "&lt;", not "<".
      .replace(/&amp;/g, "&")
  );
}
