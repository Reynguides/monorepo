/**
 * Pure relationship-extraction helpers (ADR-0019 edge taxonomy). DB-bound
 * orchestration (resolving urls to page ids, entity registration + tier-conflict
 * resolution) lives in handlers/kb/build-relationships.ts; this module is the
 * pure, fully-testable core.
 */
import type { ExtractedLink } from "./extract.ts";
import type { EdgeInput } from "../repo/edges.ts";

/** Normalize a name/text for entity matching: lowercased, de-articled, alnum+spaces. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a (possibly relative) href against a base url, or null if unparseable. */
export function absolutizeUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Build `link` edges from extracted in-content links: absolutized + deduped, with
 * the resolved destination page id when the url maps to a known page. Self-links
 * are dropped. `resolve` maps an absolute url to a page id (or null), `idFor`
 * mints edge ids (injected to keep this pure/testable).
 */
export function buildLinkEdges(
  srcPageId: string,
  baseUrl: string,
  links: readonly ExtractedLink[],
  resolve: (url: string) => string | null,
  idFor: () => string,
  now: number,
): EdgeInput[] {
  const edges: EdgeInput[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const abs = absolutizeUrl(link.href, baseUrl);
    if (abs === null || seen.has(abs)) continue;
    seen.add(abs);
    const dstPageId = resolve(abs);
    if (dstPageId === srcPageId) continue;
    const evidence = link.text.trim();
    edges.push({
      id: idFor(),
      srcPageId,
      dstUrl: abs,
      ...(dstPageId !== null ? { dstPageId } : {}),
      edgeType: "link",
      ...(evidence.length > 0 ? { evidence: evidence.slice(0, 200) } : {}),
      createdAt: now,
    });
  }
  return edges;
}

export interface EntityLite {
  normalized: string;
  canonicalPageId: string | null;
}

/**
 * Build `entity_mention` edges: known entities whose normalized name appears as a
 * whole token-run in the page text. Skips the page's own entity and tiny names.
 */
export function buildEntityMentionEdges(
  srcPageId: string,
  text: string,
  entities: readonly EntityLite[],
  idFor: () => string,
  now: number,
): EdgeInput[] {
  const haystack = ` ${normalizeName(text)} `;
  const edges: EdgeInput[] = [];
  for (const e of entities) {
    if (e.canonicalPageId === null || e.canonicalPageId === srcPageId || e.normalized.length < 3) {
      continue;
    }
    if (haystack.includes(` ${e.normalized} `)) {
      edges.push({
        id: idFor(),
        srcPageId,
        dstPageId: e.canonicalPageId,
        edgeType: "entity_mention",
        createdAt: now,
      });
    }
  }
  return edges;
}
