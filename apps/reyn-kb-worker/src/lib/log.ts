/**
 * Structured single-line JSON logging at pipeline boundaries (P8). One flat
 * object per line → greppable in `wrangler tail` / Workers Logs and trivially
 * machine-parseable. No timestamp field: the platform stamps ingestion time, and
 * omitting it keeps `formatLogLine` pure + deterministic for tests.
 */
export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null>;

/** Serialize a log record to a single JSON line. Pure. */
export function formatLogLine(level: LogLevel, event: string, fields: LogFields): string {
  return JSON.stringify({ level, event, ...fields });
}

/** Emit a structured log line to stdout (collected by Workers Logs). */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  console.log(formatLogLine(level, event, fields));
}
