/** Normalize-phase rules: transform the page candidate before validation. */
import type { PageCandidate, RuleOutcome, RuleSpec } from "./types.ts";
import { parseRuleParams, type CanonicalUrlParams, type DeriveSummaryParams } from "./params.ts";

/** Canonicalize a URL: drop fragment, lowercase host, strip tracking params. */
export function canonicalizeUrl(url: string, params: CanonicalUrlParams): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (params.dropFragment) parsed.hash = "";
  if (params.lowercaseHost) parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of params.stripParams) parsed.searchParams.delete(key);
  return parsed.toString();
}

/** Tidy text: collapse intra-line runs, trim line ends, cap blank-line runs at one. */
export function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** First non-empty paragraph, truncated to `maxChars`. */
export function firstParagraph(text: string, maxChars: number): string {
  const para =
    text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";
  return para.length > maxChars ? para.slice(0, maxChars).trimEnd() : para;
}

interface NormalizeResult {
  candidate: PageCandidate;
  changed: boolean;
  detail?: string;
}

function applyNormalizeRule(
  kind: string,
  c: PageCandidate,
  params: unknown,
): NormalizeResult | null {
  if (kind === "canonical_url") {
    const next = canonicalizeUrl(c.url, params as CanonicalUrlParams);
    if (next === null || next === c.canonicalUrl) return { candidate: c, changed: false };
    return { candidate: { ...c, canonicalUrl: next }, changed: true, detail: next };
  }
  if (kind === "collapse_whitespace") {
    const next = collapseWhitespace(c.text);
    return { candidate: { ...c, text: next }, changed: next !== c.text };
  }
  if (kind === "derive_summary") {
    if (c.summary !== null && c.summary.length > 0) return { candidate: c, changed: false };
    const s = firstParagraph(c.text, (params as DeriveSummaryParams).maxChars);
    if (s.length === 0) return { candidate: c, changed: false };
    return { candidate: { ...c, summary: s }, changed: true };
  }
  return null;
}

/** Run the normalize rules in order, threading the candidate through each. */
export function runNormalize(
  rules: readonly RuleSpec[],
  candidate: PageCandidate,
): { candidate: PageCandidate; outcomes: RuleOutcome[] } {
  let current: PageCandidate = { ...candidate, tags: [...candidate.tags] };
  const outcomes: RuleOutcome[] = [];
  for (const rule of rules) {
    const params = parseRuleParams(rule.kind, rule.params);
    const res = applyNormalizeRule(rule.kind, current, params);
    if (res === null) {
      outcomes.push({
        ruleId: rule.id,
        kind: rule.kind,
        phase: "normalize",
        status: "skipped",
        detail: "not a normalize rule",
      });
      continue;
    }
    current = res.candidate;
    outcomes.push({
      ruleId: rule.id,
      kind: rule.kind,
      phase: "normalize",
      status: res.changed ? "applied" : "skipped",
      ...(res.detail !== undefined ? { detail: res.detail } : {}),
    });
  }
  return { candidate: current, outcomes };
}
