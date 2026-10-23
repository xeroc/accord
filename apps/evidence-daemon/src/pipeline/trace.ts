/**
 * Trace ingest pipeline (ADR-0037) — the durable-seam half of
 * `POST /trace/:subaccord/:dispute/:juror`.
 *
 * Owns the push-envelope contract and persistence: shape validation
 * (`{v, seq, events[], sig}`), the per-batch event cap, and the
 * write-through append into the {@link TraceStore} (append-only, idempotent
 * per seq — first write wins). The daemon stamps arrival time (`at`); events
 * are stored verbatim, never parsed or mutated here — sealed-ness is a
 * read-time filter (WS/REST replay), not an ingest concern.
 *
 * The auth gates — Ed25519 signature verify against the juror hot key + the
 * live `Round.jurors[]` membership check — land with accord-sith; until they
 * exist the route is default-off (`TRACE_ENABLED=false` ⇒ 404).
 *
 * Authority: ADR-0037; routes in {@link ../server/routes.ts}.
 */

import { address } from "@solana/kit";

import type { TraceBatch, TraceEventRecord, TraceStore } from "../store/trace.js";

/** Max events per push (ADR-0037 §3: batch cap 64 events / 256 KiB → 413). */
export const MAX_TRACE_EVENTS = 64;

export interface TraceIngestDeps {
  readonly store: TraceStore;
}

/** Pipeline outcome → handler mapping happens in wire.ts. */
export type TraceIngestOutcome =
  { readonly status: 201 } | { readonly status: 400 | 413; readonly reason: string };

/**
 * Validate one push envelope and append it durably. Path params arrive
 * address-guarded from the route; `address()` re-brands them for the store
 * seam. Idempotent on seq via the store's own seq-check.
 */
export async function ingestTrace(
  subaccord: string,
  dispute: string,
  juror: string,
  body: unknown,
  deps: TraceIngestDeps,
): Promise<TraceIngestOutcome> {
  if (typeof body !== "object" || body === null) {
    return { status: 400, reason: "invalid body" };
  }
  // Boundary read of the request body: one Record view, every field validated
  // immediately below — nothing unvalidated escapes this function.
  const r = body as Record<string, unknown>;
  if (r.v !== 1) return { status: 400, reason: "unsupported envelope version" };
  if (typeof r.seq !== "number" || !Number.isInteger(r.seq) || r.seq < 0) {
    return { status: 400, reason: "seq must be a non-negative integer" };
  }
  if (typeof r.sig !== "string" || r.sig.length === 0) {
    return { status: 400, reason: "missing sig" };
  }
  if (!Array.isArray(r.events)) return { status: 400, reason: "events must be an array" };
  if (r.events.length > MAX_TRACE_EVENTS) {
    return { status: 413, reason: `batch exceeds ${MAX_TRACE_EVENTS} events` };
  }
  if (r.events.some((e) => typeof e !== "object" || e === null || Array.isArray(e))) {
    return { status: 400, reason: "events must be objects" };
  }
  const batch: TraceBatch = {
    subaccord: address(subaccord),
    dispute: address(dispute),
    juror: address(juror),
    seq: r.seq,
    at: Date.now(),
    events: r.events as TraceEventRecord[], // per-element object check above
  };
  await deps.store.appendBatch(batch);
  return { status: 201 };
}
