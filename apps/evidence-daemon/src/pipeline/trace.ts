/**
 * Trace ingest pipeline (ADR-0037) — the full `POST
 * /trace/:subaccord/:dispute/:juror` contract.
 *
 * Gate order (cheapest first): push-envelope shape → Ed25519 signature over
 * the canonical batch hash → live `Round.jurors[]` membership (the same gate
 * as evidence delivery) → seq monotonicity → durable append → live fan-out.
 *
 *  - `sig` is base64(Ed25519(juror hot key) over sha256(canonical JSON of
 *    {v, juror, dispute, seq, events})) — verified via
 *    `@useaccord/sdk/evidence` (single shared implementation, ADR-0015 rule).
 *  - Round gate: the juror address must be in the dispute's CURRENT round's
 *    juror set (fresh draws supersede old ones); no round yet ⇒ 403.
 *  - `seq <= last[juror]` ⇒ 200 idempotent no-op; gaps are accepted (this is
 *    a monitoring feed, not a ledger).
 *  - Store write failure is logged but never fails the request — the batch
 *    was authenticated, so it still fans out live; the durable record takes
 *    the gap (ADR-0037 §3).
 *  - Fan-out (the WS watch layer, accord-0xih/heqb) is an optional callback
 *    seam: called exactly once per ACCEPTED batch, after the append attempt.
 *
 * Authority: ADR-0037; routes in {@link ../server/routes.ts}.
 */

import bs58 from "bs58";
import { address } from "@solana/kit";
import { verifyTraceBatchSig } from "@useaccord/sdk/evidence";

import type { TraceBatch, TraceEventRecord, TraceStore } from "../store/trace.js";
import { base64ToBytes } from "../store/store.js";

/** Max events per push (ADR-0037 §3: batch cap 64 events / 256 KiB → 413). */
export const MAX_TRACE_EVENTS = 64;

/** Live Round view — the drawn-juror gate input (same shape as delivery). */
export interface TraceRoundView {
  readonly jurors: Uint8Array[];
}

export interface TraceChainReader {
  /** The dispute's CURRENT round, or null when none is drawn. */
  readRound(dispute: Uint8Array): Promise<TraceRoundView | null>;
}

export interface TraceIngestDeps {
  readonly store: TraceStore;
  readonly chain: TraceChainReader;
  /** Live fan-out seam — one call per accepted batch (store failure notwithstanding). */
  readonly fanout?: (batch: TraceBatch) => void;
  /** Structured log (main.ts JSON logger shape); omit to silence. */
  readonly log?: (msg: string, fields?: Record<string, unknown>) => void;
}

/** Pipeline outcome → handler mapping happens in wire.ts. */
export type TraceIngestOutcome =
  | { readonly status: 200 } // seq ≤ last — idempotent no-op
  | { readonly status: 201 }
  | { readonly status: 400 | 403 | 413; readonly reason: string };

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Authenticate + durably ingest one push. Path params arrive address-guarded
 * from the route; `address()` re-brands them for the store seam. The daemon
 * stamps arrival time (`at`); events are stored verbatim, never parsed or
 * mutated here — sealed-ness is a read-time filter, not an ingest concern.
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

  // Sig gate: the juror hot key signs the canonical batch hash.
  let jurorPub: Uint8Array;
  let disputeBytes: Uint8Array;
  let sig: Uint8Array;
  try {
    jurorPub = bs58.decode(juror);
    disputeBytes = bs58.decode(dispute);
    sig = base64ToBytes(r.sig);
  } catch {
    return { status: 403, reason: "malformed signature or address encoding" };
  }
  const message = { v: 1 as const, juror, dispute, seq: r.seq, events: r.events };
  if (!verifyTraceBatchSig(jurorPub, message, sig)) {
    return { status: 403, reason: "signature does not verify for juror" };
  }

  // Round gate: the juror must be drawn in the dispute's CURRENT round.
  const round = await deps.chain.readRound(disputeBytes);
  if (round === null || !round.jurors.some((j) => bytesEqual(j, jurorPub))) {
    return { status: 403, reason: "juror not drawn for this dispute" };
  }

  // Seq gate: monotonic per juror; ≤ last is an idempotent no-op.
  const last = await deps.store.lastSeq(address(subaccord), address(dispute), address(juror));
  if (last !== null && r.seq <= last) return { status: 200 };

  const batch: TraceBatch = {
    subaccord: address(subaccord),
    dispute: address(dispute),
    juror: address(juror),
    seq: r.seq,
    at: Date.now(),
    events: r.events as TraceEventRecord[], // per-element object check above
  };
  try {
    await deps.store.appendBatch(batch);
  } catch (e) {
    // Durable record takes the gap; the batch was authenticated, so live
    // fan-out still happens (ADR-0037 §3).
    deps.log?.("trace-store-write-failed", {
      dispute,
      juror,
      seq: r.seq,
      error: String(e),
    });
  }
  deps.fanout?.(batch);
  return { status: 201 };
}
