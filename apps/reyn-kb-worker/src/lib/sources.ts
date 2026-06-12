/**
 * BG3 knowledge-source catalog + pure mapping helpers. `tier` feeds ranking +
 * conflict resolution (1 = most authoritative). This module is imported by BOTH
 * the Worker-side handlers (only the types/data) and the Node-side Crawlee tool
 * (`tools/crawl.ts`); it stays dependency-free so it never drags the crawler into
 * the Worker bundle (ADR-0024).
 */
import type { StorePageRequest, StoreSourceRequest } from "../schemas/kb.ts";

/** Optional per-source content cleaning applied after extraction (ADR-0018 seam). */
export interface SourceCleanConfig {
  /** A block whose collapsed text matches any pattern is dropped (chunk-zero chrome). */
  dropBlockPatterns?: readonly RegExp[];
  /** At the first heading segment CONTAINING one of these (case-insensitive), drop that
   *  section and every block/section after it. */
  truncateAfterHeadings?: readonly string[];
  /** Drop every block/section whose heading path contains one of these (case-insensitive),
   *  wherever it appears — for a junk section that is NOT at the tail (e.g. a top promo). */
  dropSectionsByHeading?: readonly string[];
}

export interface SourceDef {
  id: string;
  name: string;
  baseUrl: string;
  sitemapUrl: string;
  tier: number;
  license: string;
  /** Crawl only URLs whose path starts with one of these prefixes (empty = all). */
  allowPathPrefixes: readonly string[];
  /** Page type assigned to ingested pages (rules refine it downstream). */
  defaultPageType: NonNullable<StorePageRequest["pageType"]>;
  /** Optional regex stripped from the crawled <title> to drop site-name noise. */
  titleSuffix?: RegExp;
  /** Optional source-specific chunk-cleaning (drop boilerplate blocks / truncate trailers). */
  clean?: SourceCleanConfig;
}

/** MediaWiki namespaces that are never article content (meta/discussion/files). */
const EXCLUDED_NAMESPACE_PREFIXES = [
  "Special:",
  "Talk:",
  "User:",
  "User_talk:",
  "File:",
  "File_talk:",
  "Category:",
  "Category_talk:",
  "Template:",
  "Template_talk:",
  "Help:",
  "MediaWiki:",
  "Module:",
  "Property:",
];

export const SOURCE_CATALOG: readonly SourceDef[] = [
  {
    id: "bg3-wiki",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    sitemapUrl: "https://bg3.wiki/sitemap.xml",
    tier: 1,
    license: "CC BY-SA 4.0",
    allowPathPrefixes: ["/wiki/"],
    defaultPageType: "article",
    // QA: an "Ad placeholder" block lands as chunk zero on bg3.wiki articles.
    clean: { dropBlockPatterns: [/^Ad placeholder$/i] },
  },
  {
    id: "fextralife",
    name: "Fextralife BG3 Wiki",
    baseUrl: "https://baldursgate3.wiki.fextralife.com",
    // Flat urlset; content lives at root paths (e.g. /Rozes+Kallista), not /wiki/.
    sitemapUrl: "https://baldursgate3.wiki.fextralife.com/sitemap.xml",
    tier: 2,
    license: "(c) Fextralife — fan wiki; crawled for local testing only",
    allowPathPrefixes: [],
    defaultPageType: "article",
    // QA: the site nav lands as ~14 separate chunk-zero blocks (headingPath:null), each a
    // single nav label. Drop each by exact whole-text match (anchored — never hits prose).
    clean: {
      dropBlockPatterns: [
        /^(Home|Wikis|News|Reviews|Guides|Forum|Sign In Now|Recent Changes|New page|File Manager|Members|Page Manager|Settings|Create Wiki)$/,
      ],
    },
  },
  {
    id: "gamerguides",
    name: "GamerGuides BG3",
    baseUrl: "https://www.gamerguides.com",
    // BG3-dense flat sitemap chunk; avoids loading the whole multi-game index.
    sitemapUrl: "https://www.gamerguides.com/sitemap/1/300",
    tier: 3,
    license: "(c) GamerGuides — commercial; crawled for local testing only",
    allowPathPrefixes: ["/baldurs-gate-3"],
    defaultPageType: "article",
  },
  {
    id: "game8",
    name: "Game8 BG3",
    baseUrl: "https://game8.co",
    // game8's sitemap index splits per game (game_<id>.xml.gz). BG3 is game 1237
    // (data-game-id on game8.co/games/BG3), so we target that single .gz — ~1,975
    // BG3 URLs — instead of the all-games index. Trailing slash in the prefix keeps
    // it BG3-only (the sitemap lists /games/BG3/archives/<id> exclusively).
    sitemapUrl: "https://game8.co/sitemaps/game_1237.xml.gz",
    tier: 3,
    license: "(c) Game8 — commercial; crawled for local testing only",
    allowPathPrefixes: ["/games/BG3/"],
    defaultPageType: "article",
    // game8 leaves the first <h1> empty, so the crawler falls back to <title>, which
    // carries a " | Baldur's Gate 3 (BG3)｜Game8" site-name tail. Strip it (the `.`
    // matches whichever apostrophe glyph the page uses) for clean, distinct titles.
    titleSuffix: /\s*\|\s*Baldur.s Gate 3.*$/u,
    // QA: a "Want more information?Learn more" promo block + a "★ … Beginner Guides …" promo
    // blob are chunk-zero junk; everything after the "… Related Guides" heading is link spam.
    clean: {
      dropBlockPatterns: [
        /^Want more information\?Learn more$/i,
        /Beginner Guides for All Starter Players/,
      ],
      // The "What can you do as a free member?" upsell section (incl. its "Game Tools"
      // subsection) sits at the TOP, before article content — drop the whole section.
      dropSectionsByHeading: ["What can you do as a free member?"],
      truncateAfterHeadings: ["Related Guides"],
    },
  },
];

export function getSource(id: string): SourceDef | undefined {
  return SOURCE_CATALOG.find((s) => s.id === id);
}

function sameOrigin(url: URL, baseUrl: string): boolean {
  try {
    return url.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isExcludedNamespace(pathname: string, prefixes: readonly string[]): boolean {
  const onPrefix = prefixes.find((p) => pathname.startsWith(p)) ?? "";
  const title = pathname.slice(onPrefix.length);
  return EXCLUDED_NAMESPACE_PREFIXES.some((ns) => title.startsWith(ns));
}

/**
 * True if `url` is a real content page of `source`: same origin, on an allowed path
 * prefix, and not a MediaWiki meta/namespace page. Pure — drives the crawl filter.
 */
export function shouldIngest(url: string, source: SourceDef): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!sameOrigin(parsed, source.baseUrl)) return false;
  const prefixes = source.allowPathPrefixes;
  const onAllowedPath =
    prefixes.length === 0 || prefixes.some((p) => parsed.pathname.startsWith(p));
  if (!onAllowedPath) return false;
  return !isExcludedNamespace(parsed.pathname, prefixes);
}

/** Source-registration body for `POST /v1/kb/sources` (idempotent). */
export function toSourceRegistration(source: SourceDef): StoreSourceRequest {
  return {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    tier: source.tier,
    license: source.license,
  };
}

/** Clean a crawled page `<title>`: strip the source's configured site-name suffix
 * (no-op for sources without one) and trim. Pure — unit-tested. */
export function cleanPageTitle(source: SourceDef, rawTitle: string): string {
  const stripped = source.titleSuffix ? rawTitle.replace(source.titleSuffix, "") : rawTitle;
  return stripped.trim();
}

/** Page-ingest body for `POST /v1/kb/pages`. `title` (from the crawler's parsed
 * DOM) is cleaned then included only when non-empty — the write handler stores it on
 * the page row (indexing never back-fills the title), so it must arrive at ingest. */
export function toPageRequest(
  source: SourceDef,
  url: string,
  html: string,
  title?: string,
): StorePageRequest {
  const base: StorePageRequest = {
    sourceId: source.id,
    url,
    html,
    pageType: source.defaultPageType,
  };
  const cleaned = title === undefined ? "" : cleanPageTitle(source, title);
  return cleaned.length > 0 ? { ...base, title: cleaned } : base;
}
