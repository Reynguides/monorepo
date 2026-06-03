/**
 * Static crawl-source catalog (ADR-0015). Each source has a `tier` ranking
 * authoritativeness (1 = most authoritative) which feeds retrieval scoring, a
 * `host` used as the SSRF allow-host filter in the crawl pipeline, and a
 * `baseUrl` used to resolve `/robots.txt` + the sitemap.
 *
 * This is the catalog of WHAT may be crawled; the live `sources` D1 rows
 * (repo/sources.ts) are what's actually been registered/crawled. The CLI
 * (tools/crawl.ts) reads from here to pick a source by `--source <id>`.
 */
export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  host: string;
  /** 1 = most authoritative. Authoritative > community in retrieval scoring. */
  tier: number;
}

/** Tier ranking authoritativeness (1 = most authoritative). */
export const TIER_AUTHORITATIVE = 1;
export const TIER_COMMUNITY_WIKI = 2;
export const TIER_COMMUNITY_GUIDE = 3;

/**
 * The PoC sources (ADR-0015). bg3.wiki is the authoritative community wiki;
 * Fextralife is a second community wiki (crawled with accepted ToS risk);
 * GamerGuides is a third-party community guide site.
 */
export const SOURCES: readonly Source[] = [
  {
    id: "bg3-wiki",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    host: "bg3.wiki",
    tier: TIER_AUTHORITATIVE,
  },
  {
    id: "fextralife",
    name: "Fextralife BG3 Wiki",
    baseUrl: "https://baldursgate3.wiki.fextralife.com",
    host: "baldursgate3.wiki.fextralife.com",
    tier: TIER_COMMUNITY_WIKI,
  },
  {
    id: "gamerguides",
    name: "GamerGuides BG3",
    baseUrl: "https://www.gamerguides.com",
    host: "www.gamerguides.com",
    tier: TIER_COMMUNITY_GUIDE,
  },
] as const;

/** Look up a source by its catalog id, or `null` if unknown. */
export function getSourceById(id: string): Source | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

/** Look up a source by its host (case-insensitive), or `null` if unknown. */
export function getSourceByHost(host: string): Source | null {
  const needle = host.toLowerCase();
  return SOURCES.find((s) => s.host.toLowerCase() === needle) ?? null;
}

/**
 * Tier for a host, or `null` if the host isn't a known source. Callers use this
 * to attach a retrieval-scoring tier to a crawled URL's origin.
 */
export function tierForHost(host: string): number | null {
  return getSourceByHost(host)?.tier ?? null;
}
