/** D1 wrapper for `rules` — table-driven ingestion/normalization/validation rules. */

export interface RuleRow {
  id: string;
  phase: string;
  kind: string;
  scope: string;
  params: string;
  severity: string;
  enabled: number;
  priority: number;
  created_at: number;
}

export interface RuleInput {
  id: string;
  phase: string;
  kind: string;
  scope?: string;
  params?: string;
  severity?: string;
  enabled?: boolean;
  priority?: number;
  createdAt: number;
}

export async function insertRule(db: D1Database, input: RuleInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rules (id, phase, kind, scope, params, severity, enabled, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.phase,
      input.kind,
      input.scope ?? "all",
      input.params ?? "{}",
      input.severity ?? "error",
      input.enabled === false ? 0 : 1,
      input.priority ?? 100,
      input.createdAt,
    )
    .run();
}

/** Enabled rules for a phase, lowest `priority` first (then id for stability). */
export async function listRulesByPhase(db: D1Database, phase: string): Promise<RuleRow[]> {
  const rows = await db
    .prepare("SELECT * FROM rules WHERE phase = ? AND enabled = 1 ORDER BY priority, id")
    .bind(phase)
    .all<RuleRow>();
  return rows.results;
}

export async function listAllRules(db: D1Database): Promise<RuleRow[]> {
  const rows = await db.prepare("SELECT * FROM rules ORDER BY phase, priority, id").all<RuleRow>();
  return rows.results;
}
