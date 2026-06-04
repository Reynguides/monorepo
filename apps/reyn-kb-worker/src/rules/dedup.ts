/** Dedup-phase rules: decide whether a candidate is inserted, skipped, or merged. */
import type { DedupDecision, ExistingPageRef, RuleOutcome, RuleSpec } from "./types.ts";
import { parseRuleParams } from "./params.ts";

export interface DedupContext {
  contentHash: string;
  canonicalUrl: string;
  /** Pages already stored for the same source (candidates for dedup/merge). */
  existing: readonly ExistingPageRef[];
}

function outcome(rule: RuleSpec, status: RuleOutcome["status"], detail?: string): RuleOutcome {
  return {
    ruleId: rule.id,
    kind: rule.kind,
    phase: "dedup",
    status,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Run dedup rules in order; the first rule that fires decides the action:
 * `near_duplicate_hash` → skip (identical bytes already stored);
 * `same_canonical_url` → merge into the existing page id. Otherwise insert.
 */
export function runDedup(rules: readonly RuleSpec[], ctx: DedupContext): DedupDecision {
  const outcomes: RuleOutcome[] = [];
  for (const rule of rules) {
    parseRuleParams(rule.kind, rule.params);
    if (rule.kind === "near_duplicate_hash") {
      const dup = ctx.existing.find((e) => e.contentHash === ctx.contentHash);
      if (dup) {
        outcomes.push(outcome(rule, "applied", `duplicate of ${dup.id}`));
        return { action: "skip", outcomes };
      }
      outcomes.push(outcome(rule, "pass"));
    } else if (rule.kind === "same_canonical_url") {
      const match = ctx.existing.find((e) => e.canonicalUrl === ctx.canonicalUrl);
      if (match) {
        outcomes.push(outcome(rule, "applied", `merge into ${match.id}`));
        return { action: "merge", mergeIntoId: match.id, outcomes };
      }
      outcomes.push(outcome(rule, "pass"));
    } else {
      outcomes.push(outcome(rule, "skipped", "not a dedup rule"));
    }
  }
  return { action: "insert", outcomes };
}
