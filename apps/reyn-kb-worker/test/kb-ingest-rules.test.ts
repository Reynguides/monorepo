import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { insertRule } from "../src/repo/rules.ts";
import { listPagesWithValidationFailures } from "../src/repo/rule-events.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface WriteResp {
  pageId: string | null;
  changed: boolean;
  deduped?: boolean;
}
interface RejectResp {
  error: string;
  issues: { kind: string }[];
}

function postPage(jsonBody: unknown): Promise<Response> {
  return call("/v1/kb/pages", { method: "POST", headers: AUTH, jsonBody });
}

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
});

describe("ingest rules at the write boundary", () => {
  it("normalize: canonical_url strips tracking params before storing", async () => {
    await insertRule(env.KB_DB, {
      id: "r-canon",
      phase: "normalize",
      kind: "canonical_url",
      params: '{"stripParams":["utm_source"]}',
      priority: 10,
      createdAt: Date.now(),
    });
    const res = await postPage({
      sourceId: "s1",
      url: "https://bg3.wiki/Fireball?utm_source=x",
      html: "<p>fireball</p>",
    });
    const { pageId } = await readJson<WriteResp>(res);
    const page = await readJson<{ canonicalUrl: string }>(await call(`/v1/kb/pages/${pageId!}`));
    expect(page.canonicalUrl).toBe("https://bg3.wiki/Fireball");
  });

  it("validate: an error-severity failure rejects (422) and records a rule_event", async () => {
    await insertRule(env.KB_DB, {
      id: "r-title",
      phase: "validate",
      kind: "require_title",
      createdAt: Date.now(),
    });
    const res = await postPage({
      sourceId: "s1",
      url: "https://bg3.wiki/NoTitle",
      html: "<p>untitled</p>",
    });
    expect(res.status).toBe(422);
    const body = await readJson<RejectResp>(res);
    expect(body.error).toBe("rule_validation_failed");
    expect(body.issues.some((i) => i.kind === "require_title")).toBe(true);
    expect((await listPagesWithValidationFailures(env.KB_DB)).length).toBe(1);
  });

  it("validate: a warn-severity failure does not block ingest", async () => {
    await insertRule(env.KB_DB, {
      id: "r-len",
      phase: "validate",
      kind: "min_text_len",
      params: '{"min":100000}',
      severity: "warn",
      createdAt: Date.now(),
    });
    const res = await postPage({ sourceId: "s1", url: "https://bg3.wiki/Short", html: "<p>x</p>" });
    expect(res.status).toBe(200);
    expect((await readJson<WriteResp>(res)).changed).toBe(true);
  });

  it("dedup: a near-duplicate (same content, different url) is skipped", async () => {
    await insertRule(env.KB_DB, {
      id: "r-dup",
      phase: "dedup",
      kind: "near_duplicate_hash",
      createdAt: Date.now(),
    });
    const html = "<p>identical body</p>";
    const a = await readJson<WriteResp>(
      await postPage({ sourceId: "s1", url: "https://bg3.wiki/A", html }),
    );
    expect(a.changed).toBe(true);
    const b = await readJson<WriteResp>(
      await postPage({ sourceId: "s1", url: "https://bg3.wiki/B", html }),
    );
    expect(b.changed).toBe(false);
    expect(b.deduped).toBe(true);
  });
});
