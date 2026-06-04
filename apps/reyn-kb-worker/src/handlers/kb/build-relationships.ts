/**
 * DB-bound relationship building, invoked from the index pipeline (P6). On each
 * (re-)index of a page it: clears the page's outgoing edges; registers the page as
 * an entity (resolving same-entity cross-source conflicts by source tier — lower
 * tier wins, the loser is deprecated and a `supersedes` edge is emitted); builds
 * `link` edges from in-content links (resolved to page ids where possible); and
 * builds `entity_mention` edges to other entities named in the page text.
 */
import { newId } from "../../lib/id.ts";
import { getPageById, mapUrlsToPageIds, setPageLifecycle, type PageRow } from "../../repo/pages.ts";
import { getSourceById } from "../../repo/sources.ts";
import { getEntityByNormalized, listEntities, upsertEntity } from "../../repo/entities.ts";
import { deleteEdgesBySrcPage, insertEdges } from "../../repo/edges.ts";
import { resolveByTier } from "../../rules/conflict.ts";
import {
  absolutizeUrl,
  buildEntityMentionEdges,
  buildLinkEdges,
  normalizeName,
} from "../../lib/relationships.ts";
import type { ExtractedContent } from "../../lib/extract.ts";

async function resolveConflict(
  db: D1Database,
  entityId: string,
  otherId: string,
  page: PageRow,
  sourceTier: number,
  normalized: string,
): Promise<void> {
  const otherPage = await getPageById(db, otherId);
  const otherSource = otherPage !== null ? await getSourceById(db, otherPage.source_id) : null;
  const otherTier = otherSource?.tier ?? Number.MAX_SAFE_INTEGER;
  const res = resolveByTier([
    { value: page.id, sourceTier, pageId: page.id },
    { value: otherId, sourceTier: otherTier, pageId: otherId },
  ]);
  if (res.unresolved || res.winner === null) return; // tie → keep the existing canonical
  const winnerId = res.winner.pageId;
  const loserId = winnerId === page.id ? otherId : page.id;
  const name = page.title ?? page.url;
  await upsertEntity(db, {
    id: entityId,
    kind: page.page_type,
    name,
    normalized,
    canonicalPageId: winnerId,
    createdAt: Date.now(),
  });
  await insertEdges(db, [
    {
      id: newId(),
      srcPageId: winnerId,
      dstPageId: loserId,
      edgeType: "supersedes",
      createdAt: Date.now(),
    },
  ]);
  await setPageLifecycle(db, loserId, "deprecated");
}

async function registerEntity(db: D1Database, page: PageRow, sourceTier: number): Promise<void> {
  const name = page.title ?? page.url;
  const normalized = normalizeName(name);
  if (normalized.length === 0) return;
  const kind = page.page_type;
  const existing = await getEntityByNormalized(db, normalized, kind);
  if (existing?.canonical_page_id != null && existing.canonical_page_id !== page.id) {
    await resolveConflict(
      db,
      existing.id,
      existing.canonical_page_id,
      page,
      sourceTier,
      normalized,
    );
    return;
  }
  await upsertEntity(db, {
    id: existing?.id ?? newId(),
    kind,
    name,
    normalized,
    canonicalPageId: page.id,
    createdAt: Date.now(),
  });
}

/** (Re)build a page's outgoing relationship edges + entity registration. */
export async function buildPageRelationships(
  db: D1Database,
  page: PageRow,
  sourceTier: number,
  extracted: ExtractedContent,
): Promise<void> {
  await deleteEdgesBySrcPage(db, page.id);
  await registerEntity(db, page, sourceTier);

  const now = Date.now();
  const absUrls = [
    ...new Set(
      extracted.links
        .map((l) => absolutizeUrl(l.href, page.url))
        .filter((u): u is string => u !== null),
    ),
  ];
  const urlMap = await mapUrlsToPageIds(db, page.source_id, absUrls);
  const linkEdges = buildLinkEdges(
    page.id,
    page.url,
    extracted.links,
    (u) => urlMap.get(u) ?? null,
    newId,
    now,
  );

  const text = extracted.blocks.map((b) => b.text).join(" ");
  const entities = await listEntities(db);
  const mentionEdges = buildEntityMentionEdges(
    page.id,
    text,
    entities.map((e) => ({ normalized: e.normalized, canonicalPageId: e.canonical_page_id })),
    newId,
    now,
  );

  await insertEdges(db, [...linkEdges, ...mentionEdges]);
}
