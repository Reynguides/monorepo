/**
 * Rules-engine types. Rules are DATA (rows in the `rules` table) applied by pure
 * code (ADR-0020). A rule's `params` JSON is validated per `kind` (see params.ts)
 * before use. The engine is split by phase: normalize transforms the candidate,
 * validate inspects it, dedup decides insert/skip/merge, conflict resolves
 * cross-source disagreements.
 */

export type RulePhase = "normalize" | "validate" | "dedup" | "conflict";

export type RuleSeverity = "error" | "warn";

/** A rule loaded from D1 with `params` still raw (validated per kind on apply). */
export interface RuleSpec {
  id: string;
  phase: RulePhase;
  kind: string;
  scope: string;
  params: unknown;
  severity: RuleSeverity;
  priority: number;
}

/** The mutable page candidate normalize rules transform and validate rules read. */
export interface PageCandidate {
  url: string;
  canonicalUrl: string;
  title: string | null;
  text: string;
  pageType: string;
  language: string;
  summary: string | null;
  tags: string[];
}

/** A minimal view of an already-stored page, for dedup decisions. */
export interface ExistingPageRef {
  id: string;
  canonicalUrl: string | null;
  contentHash: string;
}

export type RuleOutcomeStatus = "applied" | "skipped" | "pass" | "fail" | "warn";

/** One rule's result — recorded to `rule_events` by the caller (P3). */
export interface RuleOutcome {
  ruleId: string;
  kind: string;
  phase: RulePhase;
  status: RuleOutcomeStatus;
  detail?: string;
}

/** What a dedup pass decides for a candidate. */
export interface DedupDecision {
  action: "insert" | "skip" | "merge";
  mergeIntoId?: string;
  outcomes: RuleOutcome[];
}

/** Raised when a rule row carries an unknown kind or malformed params. */
export class RuleConfigError extends Error {
  public readonly issues?: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = "RuleConfigError";
    if (issues !== undefined) this.issues = issues;
  }
}
