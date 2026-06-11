/** Validate-phase rules: inspect the candidate; error-severity failures block ingest. */
import type { PageCandidate, RuleOutcome, RuleOutcomeStatus, RuleSpec } from "./types.ts";
import { parseRuleParams, type AllowedPageTypeParams, type MinTextLenParams } from "./params.ts";

interface ValidateResult {
  ok: boolean;
  detail?: string;
}

function fail(detail: string): ValidateResult {
  return { ok: false, detail };
}

function applyValidateRule(kind: string, c: PageCandidate, params: unknown): ValidateResult | null {
  if (kind === "require_title") {
    return c.title !== null && c.title.trim().length > 0 ? { ok: true } : fail("missing title");
  }
  if (kind === "min_text_len") {
    const min = (params as MinTextLenParams).min;
    return c.text.length >= min ? { ok: true } : fail(`text length ${c.text.length} < ${min}`);
  }
  if (kind === "allowed_page_type") {
    const allowed = (params as AllowedPageTypeParams).allowed;
    return allowed.includes(c.pageType)
      ? { ok: true }
      : fail(`page_type ${c.pageType} not allowed`);
  }
  if (kind === "language_is_en") {
    return c.language === "en" ? { ok: true } : fail(`language ${c.language} != en`);
  }
  return null;
}

export interface ValidateReport {
  passed: boolean;
  outcomes: RuleOutcome[];
}

/** Run validate rules. `passed` is false iff an error-severity rule failed. */
export function runValidate(rules: readonly RuleSpec[], candidate: PageCandidate): ValidateReport {
  const outcomes: RuleOutcome[] = [];
  let passed = true;
  for (const rule of rules) {
    const params = parseRuleParams(rule.kind, rule.params);
    const res = applyValidateRule(rule.kind, candidate, params);
    if (res === null) {
      outcomes.push({
        ruleId: rule.id,
        kind: rule.kind,
        phase: "validate",
        status: "skipped",
        detail: "not a validate rule",
      });
      continue;
    }
    let status: RuleOutcomeStatus;
    if (res.ok) {
      status = "pass";
    } else if (rule.severity === "warn") {
      status = "warn";
    } else {
      status = "fail";
      passed = false;
    }
    outcomes.push({
      ruleId: rule.id,
      kind: rule.kind,
      phase: "validate",
      status,
      ...(res.detail !== undefined ? { detail: res.detail } : {}),
    });
  }
  return { passed, outcomes };
}
