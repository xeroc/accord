/**
 * TraceStore trait + TraceBatch/TraceEnvelope records — the durable
 * jury-telemetry corpus (ADR-0037). Signed agent-trace batches accepted by
 * the ingest pipeline land here write-through, append-only, kept forever —
 * the corpus is the asset (fine-tuning/audit/appeals material tied to
 * ADR-0029 outcomes).
 *
 * The store is a dumb log: it never parses, filters, reorders, or mutates
 * event payloads. Sealed-ness is a READ-time filter owned by the HTTP/pipeline
 * layer (`unsealAt` lives inside opaque event bodies); signature and live
 * `Round.jurors[]` gate checks live in the ingest pipeline, not here.
 *
 * Paths are subaccord-sharded under a `traces/` prefix — disjoint from the
 * evidence layout, so retention sweeps (dispute-scoped) never touch it.
 *
 * Authority: ADR-0037.
 */

import { address, isAddress, type Address } from "@solana/kit";

/**
 * One opaque trace event (`duty-open` / `evidence` / `agent-start` / `step` /
 * `verdict` / `commit` / `reveal` / `abstain` per the ADR-0037 data contract).
 * Shape is the pipeline's business; the store persists and replays verbatim.
 */
export interface TraceEventRecord {
  readonly [key: string]: unknown;
}

/** A verified push: one seq, many events, all belonging to one juror. */
export interface TraceBatch {
  readonly subaccord: Address;
  readonly dispute: Address;
  readonly juror: Address;
  /** Per-juror monotonic batch number; every event in the batch shares it. */
  readonly seq: number;
  /** Unix ms from the push. */
  readonly at: number;
  readonly events: readonly TraceEventRecord[];
}

/** Per-event read envelope (ADR-0037 §data contract) — what readEvents yields. */
export interface TraceEnvelope {
  readonly v: 1;
  readonly at: number;
  readonly seq: number;
  readonly juror: Address;
  readonly dispute: Address;
  readonly event: TraceEventRecord;
}

/**
 * Reject a malformed address before it reaches a filesystem path or an object
 * key — base58 addresses can never contain `/`, `..`, or NUL, so this is the
 * path-hygiene gate for both backends.
 */
export function assertTraceAddress(field: string, value: string): void {
  if (!isAddress(value)) {
    throw new Error(`TraceStore: ${field} must be a base58 address, got: ${value}`);
  }
}

/** Expand one batch event to its read envelope. */
export function traceEnvelopeOf(b: TraceBatch, event: TraceEventRecord): TraceEnvelope {
  return { v: 1, at: b.at, seq: b.seq, juror: b.juror, dispute: b.dispute, event };
}

/** In-place replay ordering: (juror, seq); within a batch, event order is kept. */
export function sortTraceEnvelopes(es: TraceEnvelope[]): void {
  es.sort((a, b) => (a.juror < b.juror ? -1 : a.juror > b.juror ? 1 : a.seq - b.seq));
}

/** Durable batch record (fs JSONL line / S3 object body). */
interface BatchJson {
  v: 1;
  subaccord: string;
  dispute: string;
  juror: string;
  seq: number;
  at: number;
  events: readonly TraceEventRecord[];
}

/** Serialize a batch to one JSON line (UTF-8). Events are embedded verbatim. */
export function serializeTraceBatch(b: TraceBatch): string {
  const j: BatchJson = {
    v: 1,
    subaccord: b.subaccord,
    dispute: b.dispute,
    juror: b.juror,
    seq: b.seq,
    at: b.at,
    events: b.events,
  };
  return JSON.stringify(j);
}

/**
 * Parse one durable batch record. Throws on anything but the v1 shape — the
 * corpus is append-only, so a bad line means tampering or corruption and must
 * fail loudly, never silently.
 */
export function parseTraceBatch(s: string): TraceBatch {
  const j: unknown = JSON.parse(s);
  if (typeof j !== "object" || j === null) {
    throw new Error("TraceStore: batch record is not a JSON object");
  }
  // Boundary read of a persisted blob: one Record view, then every field is
  // validated below — nothing unvalidated escapes this function.
  const r = j as Record<string, unknown>;
  if (r.v !== 1) throw new Error(`TraceStore: unsupported batch version: ${String(r.v)}`);
  if (
    typeof r.subaccord !== "string" ||
    typeof r.dispute !== "string" ||
    typeof r.juror !== "string"
  ) {
    throw new Error("TraceStore: batch record has malformed address fields");
  }
  if (typeof r.seq !== "number" || typeof r.at !== "number") {
    throw new Error("TraceStore: batch record has malformed seq/at");
  }
  if (
    !Array.isArray(r.events) ||
    r.events.some((e) => typeof e !== "object" || e === null || Array.isArray(e))
  ) {
    throw new Error("TraceStore: batch record has malformed events");
  }
  return {
    subaccord: address(r.subaccord),
    dispute: address(r.dispute),
    juror: address(r.juror),
    seq: r.seq,
    at: r.at,
    events: r.events as TraceEventRecord[], // per-element object check above
  };
}

/**
 * Pluggable durable trace log. v1 implementations:
 * {@link ./trace-fs.ts FsTraceStore} and {@link ./trace-s3.ts S3TraceStore},
 * under the `traces/` namespace.
 *
 * Invariants every implementation MUST uphold:
 *  - Append-only, idempotent per seq: a batch whose seq is already stored
 *    (fs: seq ≤ last line's; s3: key exists) is a no-op — first write wins.
 *  - Events are stored and replayed verbatim — never parsed or mutated.
 *  - Keep forever: there is NO delete; retention sweeps never touch `traces/`.
 *  - `readEvents` yields envelopes ordered by (juror, seq), event order kept
 *    within a batch; `fromSeq` filters by batch seq.
 */
export interface TraceStore {
  appendBatch(b: TraceBatch): Promise<void>;
  /**
   * Highest stored batch seq for one juror, or `null` when none is stored —
   * the ingest seq gate (`seq <= last` ⇒ idempotent no-op, ADR-0037 §3).
   */
  lastSeq(subaccord: Address, dispute: Address, juror: Address): Promise<number | null>;
  readEvents(dispute: Address, juror?: Address, fromSeq?: number): Promise<TraceEnvelope[]>;
}
