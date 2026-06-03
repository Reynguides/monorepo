import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { sha256Hex } from "../../lib/content-hash.ts";
import { newId } from "../../lib/id.ts";
import { StorePageRequest, type StorePageResponse } from "../../schemas/kb.ts";
import { getSourceById } from "../../repo/sources.ts";
import { getPageBySourceUrl, upsertPageByUrl } from "../../repo/pages.ts";
import { createObjectStore } from "../../store/factory.ts";

/** R2 key for a page's raw HTML body. */
export function rawHtmlKey(pageId: string): string {
  return `pages/${pageId}/raw.html`;
}

/**
 * POST /v1/kb/pages (ingest-key gated). Page identity is (source_id, url) per
 * ADR-0016; content_hash is a change-detector. If the page exists and the hash
 * matches, returns {changed:false} with NO R2 write (idempotent no-op). Else it
 * writes raw HTML to R2 and upserts the row (supersede-in-place — same pageId).
 * Chunk/vector cleanup on change is Phase 4; here we just persist + flag.
 */
export const storePageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StorePageRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { sourceId, url, title, html } = parsed.data;

  const source = await getSourceById(c.env.KB_DB, sourceId);
  if (source === null) {
    return fail(c, 404, "source_not_found");
  }

  const contentHash = await sha256Hex(html);
  const existing = await getPageBySourceUrl(c.env.KB_DB, sourceId, url);
  if (existing !== null && existing.content_hash === contentHash) {
    const body: StorePageResponse = { pageId: existing.id, changed: false };
    return c.json(body, 200);
  }

  // Identity stays stable across re-crawls (supersede-in-place); the deterministic
  // R2 key is derived from that id so a changed page overwrites its own raw blob.
  const pageId = existing?.id ?? newId();
  const rawKey = rawHtmlKey(pageId);
  const store = createObjectStore(c.env);
  await store.put(rawKey, html, { contentType: "text/html" });

  const persistedId = await upsertPageByUrl(
    c.env.KB_DB,
    { id: pageId, sourceId, url, title: title ?? null, contentHash, r2RawKey: rawKey },
    Date.now(),
  );

  const body: StorePageResponse = { pageId: persistedId, changed: true };
  return c.json(body, existing === null ? 201 : 200);
};
