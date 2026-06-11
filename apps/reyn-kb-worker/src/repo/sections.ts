/** D1 wrapper for `sections` — a page's heading hierarchy. */

export interface SectionRow {
  id: string;
  page_id: string;
  ord: number;
  level: number;
  heading: string;
  anchor: string | null;
  heading_path: string;
}

export interface SectionInput {
  id: string;
  ord: number;
  level: number;
  heading: string;
  anchor?: string | null;
  headingPath: string;
}

/** Replace all sections for a page (delete + insert) — used on (re)index. */
export async function replaceSectionsForPage(
  db: D1Database,
  pageId: string,
  sections: readonly SectionInput[],
): Promise<void> {
  const statements = [db.prepare("DELETE FROM sections WHERE page_id = ?").bind(pageId)];
  for (const s of sections) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sections (id, page_id, ord, level, heading, anchor, heading_path)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(s.id, pageId, s.ord, s.level, s.heading, s.anchor ?? null, s.headingPath),
    );
  }
  await db.batch(statements);
}

export async function listSectionsByPage(db: D1Database, pageId: string): Promise<SectionRow[]> {
  const rows = await db
    .prepare("SELECT * FROM sections WHERE page_id = ? ORDER BY ord")
    .bind(pageId)
    .all<SectionRow>();
  return rows.results;
}
