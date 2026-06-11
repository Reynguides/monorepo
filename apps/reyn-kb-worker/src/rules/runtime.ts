/** Bridges D1 `rules`/`rule_events` rows to the pure rules engine + back. */
import { newId } from "../lib/id.ts";
import { insertRuleEvents, type RuleEventInput } from "../repo/rule-events.ts";
import type { RuleRow } from "../repo/rules.ts";
import type { RuleOutcome, RulePhase, RuleSpec } from "./types.ts";

/** Map loaded `rules` rows to RuleSpecs (params JSON parsed; severity coerced). */
export function toRuleSpecs(rows: readonly RuleRow[]): RuleSpec[] {
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase as RulePhase,
    kind: r.kind,
    scope: r.scope,
    params: JSON.parse(r.params) as unknown,
    severity: r.severity === "warn" ? "warn" : "error",
    priority: r.priority,
  }));
}

/** Persist rule outcomes for a page to the `rule_events` audit trail. */
export async function recordRuleEvents(
  db: D1Database,
  pageId: string,
  outcomes: readonly RuleOutcome[],
  now: number,
): Promise<void> {
  if (outcomes.length === 0) return;
  const events: RuleEventInput[] = outcomes.map((o) => ({
    id: newId(),
    pageId,
    ruleId: o.ruleId,
    phase: o.phase,
    outcome: o.status,
    detail: o.detail ?? null,
    createdAt: now,
  }));
  await insertRuleEvents(db, events);
}
