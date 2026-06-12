/**
 * HTML entity decoding for extracted text. HTMLRewriter (ADR-0018) returns text
 * chunks RAW — it does not resolve entities — so `Baldur&#39;s` and `&nbsp;`
 * survive into chunks/markdown. This pure decoder runs inside `extract.ts`'s
 * `collapse()` to normalize every captured string (title/heading/block/link).
 *
 * Coverage: ALL numeric refs (`&#NN;`, `&#xNN;`, any valid code point) + a
 * curated map of the named entities real CMSs actually emit (markup, spaces,
 * typography, symbols, currency, arrows, common math). Unmapped named refs are
 * left untouched (the full ~2,200-entity table is not worth the bundle; the long
 * tail never appears as a NAMED ref in real prose — it arrives as UTF-8 or a
 * numeric ref, both handled). Named lookups are CASE-SENSITIVE (`&dagger;` ≠
 * `&Dagger;`). Single pass: a replacement is not re-scanned (so a double-encoded
 * `&amp;#39;` decodes to `&#39;`, not `'`; no double-encoded source is observed).
 *
 * Pure + deterministic. No dependencies.
 */

const NAMED: Readonly<Record<string, string>> = {
  // markup
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // spaces
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "­",
  // typography
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  sbquo: "‚",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  lsaquo: "‹",
  rsaquo: "›",
  bull: "•",
  middot: "·",
  dagger: "†",
  Dagger: "‡",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  prime: "′",
  Prime: "″",
  permil: "‰",
  // symbols
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  minus: "−",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup1: "¹",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  para: "¶",
  sect: "§",
  infin: "∞",
  // currency
  cent: "¢",
  pound: "£",
  yen: "¥",
  euro: "€",
  curren: "¤",
  // arrows
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  // math
  le: "≤",
  ge: "≥",
  ne: "≠",
};

const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
const MAX_CODE_POINT = 0x10ffff;

function decodeNumeric(body: string): string | null {
  const isHex = body[1] === "x" || body[1] === "X";
  const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
  if (code > 0 && code <= MAX_CODE_POINT) return String.fromCodePoint(code);
  return null;
}

/** Decode numeric + curated named HTML entities. Unknown refs pass through. */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (match, body: string) => {
    if (body.charCodeAt(0) === 0x23 /* '#' */) {
      return decodeNumeric(body) ?? match;
    }
    return NAMED[body] ?? match;
  });
}
