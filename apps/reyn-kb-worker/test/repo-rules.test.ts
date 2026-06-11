import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { upsertSource } from "../src/repo/sources.ts";
import { upsertPageByUrl } from "../src/repo/pages.ts";
import { insertRule, listRulesByPhase, listAllRules } from "../src/repo/rules.ts";
import {
  insertRuleEvents,
  listRuleEventsByPage,
  listPagesWithValidationFailures,
} from "../src/repo/rule-events.ts";

const now = 1_700_000_000_000;

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "S",
    baseUrl: "https://x",
    tier: 1,
    createdAt: now,
  });
  await upsertPageByUrl(env.KB_DB, {
    id: "p1",
    sourceId: "s1",
    url: "https://x/p1",
    contentHash: "h",
    crawledAt: now,
    updatedAt: now,
  });
});

describe("repo/rules", () => {
  it("lists enabled rules per phase by priority, omitting disabled ones", async () => {
    await insertRule(env.KB_DB, {
      id: "r-late",
      phase: "normalize",
      kind: "collapse_whitespace",
      scope: "page_type:spell",
      severity: "warn",
      priority: 200,
      createdAt: now,
    });
    await insertRule(env.KB_DB, {
      id: "r-early",
      phase: "normalize",
      kind: "canonical_url",
      params: '{"stripParams":["utm_source"]}',
      priority: 10,
      createdAt: now,
    });
    await insertRule(env.KB_DB, {
      id: "r-off",
      phase: "normalize",
      kind: "x",
      enabled: false,
      priority: 1,
      createdAt: now,
    });
    await insertRule(env.KB_DB, {
      id: "r-val",
      phase: "validate",
      kind: "require_title",
      createdAt: now,
    });

    const normalize = await listRulesByPhase(env.KB_DB, "normalize");
    expect(normalize.map((r) => r.id)).toEqual(["r-early", "r-late"]); // priority order, disabled omitted
    expect(normalize[0]!.params).toContain("utm_source");
    expect(normalize[0]!.scope).toBe("all"); // default
    expect(normalize[0]!.severity).toBe("error"); // default

    expect((await listRulesByPhase(env.KB_DB, "validate")).map((r) => r.id)).toEqual(["r-val"]);
    expect((await listAllRules(env.KB_DB)).length).toBe(4); // includes disabled
  });
});

describe("repo/rule-events", () => {
  it("is a no-op on empty input", async () => {
    await insertRuleEvents(env.KB_DB, []);
    expect(await listRuleEventsByPage(env.KB_DB, "p1")).toEqual([]);
  });

  it("records events for a page and surfaces validation failures", async () => {
    await insertRuleEvents(env.KB_DB, [
      {
        id: "ev0",
        pageId: "p1",
        ruleId: "r-early",
        phase: "normalize",
        outcome: "applied",
        detail: "canonicalized",
        createdAt: now,
      },
      {
        id: "ev1",
        pageId: "p1",
        ruleId: "r-val",
        phase: "validate",
        outcome: "fail",
        detail: "missing title",
        createdAt: now + 1,
      },
    ]);
    const events = await listRuleEventsByPage(env.KB_DB, "p1");
    expect(events.map((e) => e.outcome)).toEqual(["applied", "fail"]);
    expect(events[0]!.detail).toBe("canonicalized");

    expect(await listPagesWithValidationFailures(env.KB_DB)).toEqual(["p1"]);
  });
});
