/** D1 wrapper for `rule_events` — the durable audit trail of rule outcomes. */

export interface RuleEventRow {
  id: string;
  page_id: string;
  rule_id: string;
  phase: string;
  outcome: string;
  detail: string | null;
  created_at: number;
}

export interface RuleEventInput {
  id: string;
  pageId: string;
  ruleId: string;
  phase: string;
  outcome: string;
  detail?: string | null;
  createdAt: number;
}

export async function insertRuleEvents(
  db: D1Database,
  events: readonly RuleEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  const statements = events.map((e) =>
    db
      .prepare(
        `INSERT INTO rule_events (id, page_id, rule_id, phase, outcome, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(e.id, e.pageId, e.ruleId, e.phase, e.outcome, e.detail ?? null, e.createdAt),
  );
  await db.batch(statements);
}

export async function listRuleEventsByPage(
  db: D1Database,
  pageId: string,
): Promise<RuleEventRow[]> {
  const rows = await db
    .prepare("SELECT * FROM rule_events WHERE page_id = ? ORDER BY created_at, id")
    .bind(pageId)
    .all<RuleEventRow>();
  return rows.results;
}

/** Pages with an unresolved `validate`+`fail` event — used by verify (P8). */
export async function listPagesWithValidationFailures(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      "SELECT DISTINCT page_id AS id FROM rule_events WHERE phase = 'validate' AND outcome = 'fail'",
    )
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}
