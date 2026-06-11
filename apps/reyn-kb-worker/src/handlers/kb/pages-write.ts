import type { Handler } from "hono";
import type { Env } from "../../types/env.ts";
import { fail } from "../../lib/errors.ts";
import { sha256Hex } from "../../lib/content-hash.ts";
import { newId } from "../../lib/id.ts";
import { StorePageRequest } from "../../schemas/kb.ts";
import { getSourceById } from "../../repo/sources.ts";
import { getPageBySourceUrl, listPageRefsBySource, upsertPageByUrl } from "../../repo/pages.ts";
import { listRulesByPhase } from "../../repo/rules.ts";
import { createObjectStore } from "../../store/factory.ts";
import { runNormalize } from "../../rules/normalize.ts";
import { runValidate } from "../../rules/validate.ts";
import { runDedup } from "../../rules/dedup.ts";
import { toRuleSpecs, recordRuleEvents } from "../../rules/runtime.ts";
import type { PageCandidate, RuleOutcome } from "../../rules/types.ts";

interface FailedRule {
  kind: string;
  detail?: string;
}

interface WriteRuleResult {
  outcome: "ok" | "rejected" | "skip";
  candidate: PageCandidate;
  outcomes: RuleOutcome[];
  failed?: FailedRule[];
}

/** Run normalize → validate → (for new pages) dedup, collecting outcomes. */
async function applyWriteRules(
  db: D1Database,
  candidate: PageCandidate,
  contentHash: string,
  sourceId: string,
  url: string,
  isNew: boolean,
): Promise<WriteRuleResult> {
  const norm = runNormalize(toRuleSpecs(await listRulesByPhase(db, "normalize")), candidate);
  const val = runValidate(toRuleSpecs(await listRulesByPhase(db, "validate")), norm.candidate);
  const outcomes: RuleOutcome[] = [...norm.outcomes, ...val.outcomes];
  if (!val.passed) {
    const failed = val.outcomes
      .filter((o) => o.status === "fail")
      .map((o) => ({ kind: o.kind, ...(o.detail !== undefined ? { detail: o.detail } : {}) }));
    return { outcome: "rejected", candidate: norm.candidate, outcomes, failed };
  }
  if (isNew) {
    const refs = await listPageRefsBySource(db, sourceId, url);
    const dedup = runDedup(toRuleSpecs(await listRulesByPhase(db, "dedup")), {
      contentHash,
      canonicalUrl: norm.candidate.canonicalUrl,
      existing: refs.map((r) => ({
        id: r.id,
        canonicalUrl: r.canonical_url,
        contentHash: r.content_hash,
      })),
    });
    outcomes.push(...dedup.outcomes);
    if (dedup.action === "skip") return { outcome: "skip", candidate: norm.candidate, outcomes };
  }
  return { outcome: "ok", candidate: norm.candidate, outcomes };
}

/**
 * POST /v1/kb/pages (ingest-key gated). Stores raw HTML to R2 + upserts page
 * metadata by (source_id, url). Idempotent: unchanged content_hash → no-op.
 * Runs the normalize/validate/dedup rule phases; validation failures → 422.
 */
function buildCandidate(data: StorePageRequest): PageCandidate {
  return {
    url: data.url,
    canonicalUrl: data.url,
    title: data.title ?? null,
    text: data.html,
    pageType: data.pageType ?? "article",
    language: data.language ?? "en",
    summary: null,
    tags: [],
  };
}

export const storePageHandler: Handler<{ Bindings: Env }> = async (c) => {
  const raw = (await c.req.json().catch(() => null)) as unknown;
  const parsed = StorePageRequest.safeParse(raw);
  if (!parsed.success) {
    return fail(c, 400, "validation_failed", undefined, parsed.error.issues);
  }
  const { sourceId, url, html } = parsed.data;
  const db = c.env.KB_DB;
  if ((await getSourceById(db, sourceId)) === null) {
    return fail(c, 404, "source_not_found");
  }

  const contentHash = await sha256Hex(html);
  const existing = await getPageBySourceUrl(db, sourceId, url);
  if (existing !== null && existing.content_hash === contentHash) {
    return c.json({ pageId: existing.id, changed: false }, 200);
  }

  const candidate = buildCandidate(parsed.data);
  const pageId = existing !== null ? existing.id : newId();
  const now = Date.now();

  const res = await applyWriteRules(db, candidate, contentHash, sourceId, url, existing === null);
  if (res.outcome === "rejected") {
    await recordRuleEvents(db, pageId, res.outcomes, now);
    return fail(c, 422, "rule_validation_failed", "page rejected by validation rules", res.failed);
  }
  if (res.outcome === "skip") {
    await recordRuleEvents(db, pageId, res.outcomes, now);
    return c.json({ pageId: null, changed: false, deduped: true }, 200);
  }

  const store = createObjectStore(c.env);
  const r2RawKey = `pages/${pageId}/raw.html`;
  await store.put(r2RawKey, html, { contentType: "text/html; charset=utf-8" });
  const result = await upsertPageByUrl(db, {
    id: pageId,
    sourceId,
    url,
    canonicalUrl: res.candidate.canonicalUrl,
    title: res.candidate.title,
    pageType: res.candidate.pageType,
    summary: res.candidate.summary,
    language: res.candidate.language,
    tags: res.candidate.tags,
    contentHash,
    r2RawKey,
    crawledAt: now,
    updatedAt: now,
  });
  await recordRuleEvents(db, result.id, res.outcomes, now);
  return c.json({ pageId: result.id, changed: true }, 200);
};
