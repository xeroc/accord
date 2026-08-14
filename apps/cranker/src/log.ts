/**
 * Structured JSON-lines log sink — the single stdout emit point for the
 * cranker. Every line carries `time` (ISO-8601 UTC, ms precision) so log files
 * are sortable/greppable by wall clock, plus `msg` and any structured fields.
 */

export type LogSink = (msg: string, fields?: Record<string, unknown>) => void;

/** Stamp + emit one JSON log line to stdout. */
export function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...fields }));
}
