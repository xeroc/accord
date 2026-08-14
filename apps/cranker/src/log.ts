/**
 * Structured JSON-lines log sink — the single stdout emit point for the
 * cranker. Every line carries `time` (ISO-8601 UTC, ms precision) so log files
 * are sortable/greppable by wall clock, plus `msg` and any structured fields.
 *
 * `time` and `msg` are reserved: keys of the same name inside `fields` are
 * dropped (not allowed to clobber the envelope).
 */

export type LogSink = (msg: string, fields?: Record<string, unknown>) => void;

/** Stamp + emit one JSON log line to stdout. */
export function log(msg: string, fields: Record<string, unknown> = {}): void {
  const safeFields = { ...fields };
  delete safeFields.msg;
  delete safeFields.time;
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...safeFields }));
}
