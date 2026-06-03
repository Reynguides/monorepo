/**
 * Pragmatic HTML → markdown/text extractor for the RAG ingestion pipeline.
 *
 * workerd has no DOM and we deliberately avoid pulling in a heavy parser
 * (cheerio/jsdom). This is a regex-and-string-scan cleaner: it is NOT a
 * spec-compliant HTML parser and does not need to be — the output only has to
 * be good enough to chunk and embed. It strips non-content regions
 * (`<script>`/`<style>`/`<head>`/comments), extracts the `<title>`, converts a
 * handful of block + inline tags to a markdown-ish string, and produces a
 * plain-text variant with tags removed, entities decoded, and whitespace
 * collapsed. Pure and deterministic.
 */

export interface CleanedHtml {
  /** The page `<title>`, decoded + trimmed, or undefined when absent/empty. */
  title?: string;
  /** Markdown-ish rendering (headings, paragraphs, list items, links). */
  markdown: string;
  /** Plain text: tags removed, entities decoded, whitespace collapsed. */
  text: string;
}

/** Named/numeric HTML entities we decode. Kept small + common on purpose. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** Decodes the named + numeric entities we care about; leaves the rest as-is. */
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const digits = isHex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, isHex ? 16 : 10);
      if (Number.isNaN(code) || code <= 0 || code > 0x10ffff) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Removes a region delimited by a tag pair, e.g. <script>…</script>, anywhere. */
function stripRegion(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, " ");
}

/** Collapses runs of spaces/tabs and trims trailing space on each line. */
function collapseInlineWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, " ").replace(/ *\n/g, "\n");
}

/** Collapses 3+ consecutive newlines down to a blank-line separator. */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/** Extracts the first <title>…</title>, decoded + trimmed, or undefined. */
function extractTitle(html: string): string | undefined {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m === null) {
    return undefined;
  }
  // The capture group always matches (possibly empty), so `?? ""` is a
  // type-narrowing guard only — never reachable via the public API.
  /* istanbul ignore next -- @preserve unreachable: group 1 is always a string */
  const inner = m[1] ?? "";
  const title = decodeEntities(stripAllTags(inner)).replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : undefined;
}

/** Removes every remaining tag, leaving its text content. */
function stripAllTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/**
 * Converts links to markdown `[text](href)` in place, before block handling.
 * A link with no href (or an empty one) degrades to just its text.
 */
function convertLinks(html: string): string {
  return html.replace(
    /<a\b[^>]*?(?:\shref=("([^"]*)"|'([^']*)'|([^\s>]+)))?[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _hrefAttr, dq?: string, sq?: string, bare?: string, inner?: string) => {
      const href = (dq ?? sq ?? bare ?? "").trim();
      // The inner-text group always matches (possibly empty), so `?? ""` is a
      // type-narrowing guard only — never reachable via the public API.
      /* istanbul ignore next -- @preserve unreachable: inner is always a string */
      const innerText = inner ?? "";
      const text = decodeEntities(stripAllTags(innerText)).replace(/\s+/g, " ").trim();
      if (href.length === 0) {
        return text;
      }
      if (text.length === 0) {
        return "";
      }
      return `[${text}](${href})`;
    },
  );
}

/** Maps an h1–h6 tag to its markdown heading prefix. */
function headingPrefix(level: number): string {
  return `${"#".repeat(level)} `;
}

/**
 * Cleans HTML into a title, a markdown-ish string, and a plain-text variant.
 * The two outputs share the same extraction; markdown keeps lightweight
 * structure (headings, list bullets, links) while text is structure-free.
 */
export function cleanHtml(html: string): CleanedHtml {
  const title = extractTitle(html);

  // 1. Drop non-content regions entirely.
  let body = html;
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = stripRegion(body, "script");
  body = stripRegion(body, "style");
  body = stripRegion(body, "head");
  body = stripRegion(body, "noscript");
  body = stripRegion(body, "template");

  // 2. Inline links → markdown link syntax (before tags are stripped).
  body = convertLinks(body);

  // 3. Block-level tags → newline-delimited markdown.
  body = body.replace(/<br\s*\/?>/gi, "\n");
  body = body.replace(/<\/(p|div|section|article|header|footer|tr|table|ul|ol)>/gi, "\n\n");
  body = body.replace(/<li\b[^>]*>/gi, "\n- ");
  body = body.replace(/<\/li>/gi, "\n");
  for (let level = 1; level <= 6; level++) {
    body = body.replace(new RegExp(`<h${level}\\b[^>]*>`, "gi"), `\n\n${headingPrefix(level)}`);
    body = body.replace(new RegExp(`<\\/h${level}>`, "gi"), "\n\n");
  }

  // 4. Remove all remaining tags, decode entities.
  body = stripAllTags(body);
  body = decodeEntities(body);

  // 5. Normalise whitespace into a tidy markdown string.
  const markdown = collapseBlankLines(collapseInlineWhitespace(body))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  // 6. Plain text: same content, no markdown markers, single-spaced.
  const text = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return { ...(title !== undefined ? { title } : {}), markdown, text };
}
