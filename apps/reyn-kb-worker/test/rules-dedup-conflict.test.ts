import { describe, expect, it } from "vitest";
import { runDedup } from "../src/rules/dedup.ts";
import { resolveByTier } from "../src/rules/conflict.ts";
import type { ExistingPageRef, RuleSpec } from "../src/rules/types.ts";

function spec(kind: string): RuleSpec {
  return {
    id: `r-${kind}`,
    phase: "dedup",
    kind,
    scope: "all",
    params: {},
    severity: "error",
    priority: 100,
  };
}

const existing: ExistingPageRef[] = [
  { id: "p-old", canonicalUrl: "https://x/a", contentHash: "hash-A" },
];

describe("runDedup", () => {
  it("skips a near-duplicate (identical content hash)", () => {
    const d = runDedup([spec("near_duplicate_hash")], {
      contentHash: "hash-A",
      canonicalUrl: "https://x/b",
      existing,
    });
    expect(d.action).toBe("skip");
    expect(d.outcomes[0]!.detail).toContain("p-old");
  });

  it("merges into the existing page on same canonical url", () => {
    const d = runDedup([spec("near_duplicate_hash"), spec("same_canonical_url")], {
      contentHash: "fresh",
      canonicalUrl: "https://x/a",
      existing,
    });
    expect(d.action).toBe("merge");
    expect(d.mergeIntoId).toBe("p-old");
  });

  it("inserts when no rule fires and flags non-dedup kinds as skipped", () => {
    const d = runDedup(
      [spec("require_title"), spec("near_duplicate_hash"), spec("same_canonical_url")],
      { contentHash: "fresh", canonicalUrl: "https://x/new", existing },
    );
    expect(d.action).toBe("insert");
    expect(d.outcomes[0]!.status).toBe("skipped");
    expect(d.outcomes.filter((o) => o.status === "pass").length).toBe(2);
  });
});

describe("resolveByTier", () => {
  it("returns no winner for empty input", () => {
    expect(resolveByTier([])).toEqual({ winner: null, losers: [], unresolved: false });
  });

  it("prefers the lowest tier (most authoritative source)", () => {
    const r = resolveByTier([
      { value: "8d6", sourceTier: 1, pageId: "wiki" },
      { value: "6d6", sourceTier: 2, pageId: "fextra" },
    ]);
    expect(r.unresolved).toBe(false);
    expect(r.winner!.pageId).toBe("wiki");
    expect(r.losers.map((l) => l.pageId)).toEqual(["fextra"]);
  });

  it("flags unresolved when top-tier sources disagree", () => {
    const r = resolveByTier([
      { value: "8d6", sourceTier: 1, pageId: "a" },
      { value: "10d6", sourceTier: 1, pageId: "b" },
    ]);
    expect(r.unresolved).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.losers.length).toBe(2);
  });

  it("treats agreeing top-tier sources as resolved", () => {
    const r = resolveByTier([
      { value: "8d6", sourceTier: 1, pageId: "a" },
      { value: "8d6", sourceTier: 1, pageId: "b" },
    ]);
    expect(r.unresolved).toBe(false);
    expect(r.winner!.pageId).toBe("a");
  });
});
