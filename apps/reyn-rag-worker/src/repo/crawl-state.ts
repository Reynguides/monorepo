/**
 * `crawl_state` table — thin wrappers over D1 prepared statements.
 * Row shape mirrors migrations/kb-d1/0001_init.sql. snake_case columns.
 *
 * One row per source (PK = `source_id`) tracking crawl progress so a re-crawl
 * resumes rather than restarts. `cursor` is declared TEXT (opaque) in the
 * schema; the sitemap pipeline uses it as a numeric resume index, so the repo
 * stores it as a decimal string and parses it back to a number on read.
 */

export interface CrawlStateRow {
  source_id: string;
  last_sitemap_at: number | null;
  cursor: string | null;
  status: string;
}

const CRAWL_STATE_COLS = "source_id, last_sitemap_at, cursor, status";

export async function getCrawlState(
  db: D1Database,
  sourceId: string,
): Promise<CrawlStateRow | null> {
  const row = await db
    .prepare(`SELECT ${CRAWL_STATE_COLS} FROM crawl_state WHERE source_id = ?`)
    .bind(sourceId)
    .first<CrawlStateRow>();
  return row ?? null;
}

export interface UpsertCrawlStateInput {
  sourceId: string;
  /** epoch ms of the last sitemap fetch; omitted leaves the column untouched. */
  lastSitemapAt?: number;
  /** Opaque resume cursor (the pipeline uses a numeric index as a string). */
  cursor: string;
  status: string;
}

/**
 * Inserts the row for a new source or UPDATEs the existing one in place (PK is
 * `source_id`). When `lastSitemapAt` is omitted on an update the existing value
 * is preserved (COALESCE); on insert an omitted `lastSitemapAt` stores NULL.
 */
export async function upsertCrawlState(
  db: D1Database,
  input: UpsertCrawlStateInput,
): Promise<void> {
  const lastSitemapAt = input.lastSitemapAt ?? null;
  await db
    .prepare(
      `INSERT INTO crawl_state (source_id, last_sitemap_at, cursor, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET
         last_sitemap_at = COALESCE(excluded.last_sitemap_at, crawl_state.last_sitemap_at),
         cursor = excluded.cursor,
         status = excluded.status`,
    )
    .bind(input.sourceId, lastSitemapAt, input.cursor, input.status)
    .run();
}
