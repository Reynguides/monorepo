/**
 * BG3 knowledge-source catalog + pure mapping helpers. `tier` feeds ranking +
 * conflict resolution (1 = most authoritative). This module is imported by BOTH
 * the Worker-side handlers (only the types/data) and the Node-side Crawlee tool
 * (`tools/crawl.ts`); it stays dependency-free so it never drags the crawler into
 * the Worker bundle (ADR-0024).
 */
import type { StorePageRequest, StoreSourceRequest } from "../schemas/kb.ts";

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

/** Page-ingest body for `POST /v1/kb/pages`. `title` (from the crawler's parsed
 * DOM) is included only when present — the write handler stores it on the page row
 * (indexing never back-fills the title), so it must arrive at ingest. */
export function toPageRequest(
  source: SourceDef,
  url: string,
  html: string,
  title?: string,
): StorePageRequest {
  const base: StorePageRequest = { sourceId: source.id, url, html, pageType: source.defaultPageType };
  return title !== undefined && title.length > 0 ? { ...base, title } : base;
}
