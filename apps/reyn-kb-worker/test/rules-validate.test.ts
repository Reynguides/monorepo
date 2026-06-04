import { describe, expect, it } from "vitest";
import { runValidate } from "../src/rules/validate.ts";
import type { PageCandidate, RuleSeverity, RuleSpec } from "../src/rules/types.ts";

function candidate(over: Partial<PageCandidate> = {}): PageCandidate {
  return {
    url: "https://x/p",
    canonicalUrl: "https://x/p",
    title: "Fireball",
    text: "a fairly long body of text",
    pageType: "spell",
    language: "en",
    summary: null,
    tags: [],
    ...over,
  };
}

function spec(kind: string, params: unknown = {}, severity: RuleSeverity = "error"): RuleSpec {
  return {
    id: `r-${kind}`,
    phase: "validate",
    kind,
    scope: "all",
    params,
    severity,
    priority: 100,
  };
}

describe("runValidate", () => {
  it("passes when all rules are satisfied", () => {
    const rules = [
      spec("require_title"),
      spec("min_text_len", { min: 5 }),
      spec("allowed_page_type", { allowed: ["spell", "item"] }),
      spec("language_is_en"),
    ];
    const report = runValidate(rules, candidate());
    expect(report.passed).toBe(true);
    expect(report.outcomes.every((o) => o.status === "pass")).toBe(true);
  });

  it("fails (error severity) on a missing title and records detail", () => {
    const report = runValidate([spec("require_title")], candidate({ title: "   " }));
    expect(report.passed).toBe(false);
    expect(report.outcomes[0]!.status).toBe("fail");
    expect(report.outcomes[0]!.detail).toBe("missing title");
  });

  it("downgrades a failure to warn (does not block) when severity=warn", () => {
    const report = runValidate([spec("min_text_len", { min: 999 }, "warn")], candidate());
    expect(report.passed).toBe(true);
    expect(report.outcomes[0]!.status).toBe("warn");
  });

  it("fails on disallowed page_type and on non-en language", () => {
    const typeReport = runValidate(
      [spec("allowed_page_type", { allowed: ["item"] })],
      candidate({ pageType: "spell" }),
    );
    expect(typeReport.passed).toBe(false);
    expect(typeReport.outcomes[0]!.detail).toContain("page_type spell not allowed");

    const langReport = runValidate([spec("language_is_en")], candidate({ language: "fr" }));
    expect(langReport.passed).toBe(false);
    expect(langReport.outcomes[0]!.detail).toBe("language fr != en");
  });

  it("flags non-validate kinds as skipped without failing", () => {
    const report = runValidate([spec("canonical_url")], candidate());
    expect(report.passed).toBe(true);
    expect(report.outcomes[0]!.status).toBe("skipped");
    expect(report.outcomes[0]!.detail).toBe("not a validate rule");
  });
});
