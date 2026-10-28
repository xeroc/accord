/**
 * trace sink (bean accord-9pdg, ADR-0037) — the jurat push leg of jury
 * telemetry.
 *
 * Contract mirrors NotifyChannel (ADR-0036 decision 8): `emit` is sync and
 * NEVER throws; pushes are fire-and-forget POSTs to the evidence daemon
 * (`POST /trace/:subaccord/:dispute/:juror`) with a 2s timeout; a failed or
 * timed-out push drops its batch — trace loss leaves visible seq gaps and
 * that is accepted (the durable record is whatever actually arrived). A
 * bounded queue (256, drop-oldest) keeps a dead endpoint from ballooning
 * memory while a duty runs.
 *
 * Wire format (HANDOFF §2): batch `{v: 1, seq, events, sig}` where `seq` is
 * the per-(juror, dispute) monotonic seq of the FIRST event (event i →
 * seq + i) and `sig = Ed25519(hot key) over sha256(canonical JSON of
 * {v, juror, dispute, seq, events})` — canonical JSON comes from the agent
 * runner (sorted keys, no whitespace), one shared form for digests and sigs.
 *
 * `JURAT_TRACE_MODE=open` (demo) strips `unsealAt` from verdict frames at
 * emit, so the daemon releases them at push; sealed mode forwards the
 * emitter's `unsealAt` (= round revealEnd) untouched.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { buildTraceBatchMessage } from "@useaccord/sdk/evidence";
import type { FailureKind } from "../duty/types.ts";
import type { RunnerTraceEvent } from "../agent/runner.ts";

/** Queue cap — oldest event dropped when full (ADR-0037 failure contract). */
export const TRACE_QUEUE_CAP = 256;
/** Daemon ingest caps a batch at 64 events (413 above) — chunk below it. */
export const TRACE_MAX_BATCH_EVENTS = 64;
/** Push timeout — a hung endpoint must never stall the duty pipeline. */
export const TRACE_PUSH_TIMEOUT_MS = 2_000;

/** Duty-lifecycle + vote events (HANDOFF §2); agent events reuse the runner's. */
export type TraceEvent =
  | RunnerTraceEvent
  | DutyOpenEvent
  | EvidenceEvent
  | VerdictEvent
  | CommitEvent
  | RevealEvent
  | AbstainEvent;

/** Emitted when a duty enters tracking. Windows are unix ms. */
export interface DutyOpenEvent {
  kind: "duty-open";
  round: number;
  seat: number;
  reviewEnd: number;
  commitEnd: number;
  revealEnd: number;
}

/** Evidence intake done — paths + digests + sizes, NEVER content. */
export interface EvidenceEvent {
  kind: "evidence";
  files: TraceEvidenceFile[];
}

/** One intake file's manifest entry (path + content digest + size — no content). */
export type TraceEvidenceFile = { path: string; sha256: string; bytes: number };

/** The settled verdict — sealed via `unsealAt` (round revealEnd) unless open mode. */
export interface VerdictEvent {
  kind: "verdict";
  optionIndex: number;
  rationale: string;
  confidence: number;
  unsealAt?: number;
}

/** Vote commit — tx sig in live mode, `dryRun` flag always. */
export interface CommitEvent {
  kind: "commit";
  tx?: string;
  dryRun: boolean;
}

/** Vote reveal. */
export interface RevealEvent {
  kind: "reveal";
  tx: string;
}

/** The clean-abstain exit (no on-chain abstain exists in v1). */
export interface AbstainEvent {
  kind: "abstain";
  failure: FailureKind;
  reason: string;
}

/** Durable per-event record (HANDOFF §2) — the daemon appends one per event. */
export interface TraceEnvelope {
  v: 1;
  /** Unix ms. */
  at: number;
  /** Per-(juror, dispute) monotonic; event i of a batch → batch.seq + i. */
  seq: number;
  /** Juror hot key (base58) — the identity that commits votes. */
  juror: string;
  dispute: string;
  event: TraceEvent;
}

/** POST body — `sig` covers the canonical JSON of {v, juror, dispute, seq, events}. */
export interface TraceBatchBody {
  v: 1;
  seq: number;
  events: TraceEvent[];
  sig: string;
}

/** The sink seam: sync, never throws (ADR-0037 failure contract). */
export interface TraceSink {
  emit(event: TraceEvent): void;
  /** Resolves when the queue is drained and no push is in flight; never rejects. */
  drain(): Promise<void>;
}

/** Construction options. `url` unset → no-op sink (JURAT_TRACE_URL absent). */
export interface TraceSinkOptions {
  url?: string;
  mode: "sealed" | "open";
  /** Juror hot key, base58. */
  juror: string;
  subaccord: string;
  dispute: string;
  /** 32-byte Ed25519 seed of the hot key (first half of a solana keypair file). */
  seed: Uint8Array;

  /** Push timeout override (tests). Default TRACE_PUSH_TIMEOUT_MS. */
  pushTimeoutMs?: number;
}

/**
 * Ed25519 signature over sha256(canonical JSON of {v, juror, dispute, seq,
 * events}) — deterministic, verified daemon-side against the juror address
 * from the live Round. The hash comes from the SDK's shared implementation
 * (single canonical form, ADR-0037) and the signature is BASE64 — the wire
 * format the daemon's `base64ToBytes` ingest decodes.
 */
export function signTraceBatch(
  batch: { v: 1; seq: number; events: TraceEvent[] },
  ident: { juror: string; dispute: string },
  seed: Uint8Array,
): string {
  const hash = buildTraceBatchMessage({
    v: batch.v,
    juror: ident.juror,
    dispute: ident.dispute,
    seq: batch.seq,
    events: batch.events,
  });
  return Buffer.from(ed25519.sign(hash, seed)).toString("base64");
}

/** Build the sink. Unset `url` → no-op; everything else never throws. */
export function makeTraceSink(options: TraceSinkOptions): TraceSink {
  if (options.url === undefined) {
    return { emit: () => {}, drain: () => Promise.resolve() };
  }

  const endpoint =
    `${options.url.replace(/\/+$/, "")}/trace/` +
    `${encodeURIComponent(options.subaccord)}/${encodeURIComponent(options.dispute)}/` +
    encodeURIComponent(options.juror);
  const pushTimeoutMs = options.pushTimeoutMs ?? TRACE_PUSH_TIMEOUT_MS;

  const queue: TraceEvent[] = [];
  let nextSeq = 1;
  let scheduled = false;
  let tail: Promise<void> = Promise.resolve();

  function emit(event: TraceEvent): void {
    let queued: TraceEvent = event;
    if (event.kind === "verdict" && options.mode === "open") {
      // DELETE `unsealAt`, never `{ ...event, unsealAt: undefined }`: an
      // explicitly-undefined key survives Object.entries in the local
      // canonical form (rendered `null`) but vanishes in the JSON wire form
      // the daemon re-canonicalizes — the signature hash desyncs (caught by
      // the cross-app suite in evidence-daemon's trace tests).
      const rest: VerdictEvent = { ...event };
      delete rest.unsealAt;
      queued = rest;
    }
    queue.push(queued);
    if (queue.length > TRACE_QUEUE_CAP) queue.shift(); // drop-oldest
    if (!scheduled) {
      scheduled = true;
      tail = tail.then(flush).finally(() => {
        scheduled = false;
      });
    }
  }

  async function flush(): Promise<void> {
    while (queue.length > 0) {
      const events = queue.splice(0, Math.min(TRACE_MAX_BATCH_EVENTS, queue.length));
      const batch = { v: 1 as const, seq: nextSeq, events };
      nextSeq += events.length;
      const sig = signTraceBatch(batch, options, options.seed);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...batch, sig }),
          signal: AbortSignal.timeout(pushTimeoutMs),
        });
        if (!res.ok) {
          // The daemon's 4xx body carries {"error": reason} — surface it; it
          // names the gate that rejected (sig / round-membership / shape).
          const reason = await res.text().catch(() => "");
          console.warn(
            `[trace] push rejected (${res.status}) — batch from seq ${batch.seq} dropped: ` +
              reason.slice(0, 200),
          );
        }
      } catch (err) {
        console.warn(`[trace] push failed (batch from seq ${batch.seq} dropped):`, err);
      }
    }
  }

  return {
    emit,
    drain: () => tail,
  };
}

/**
 * Bind memoized per-duty sinks — the `RuntimeDeps.trace` seam. One binder
 * per process; each (subaccord, dispute) pair keeps ONE sink so the queue
 * and seq counter survive across scans of the same duty (a fresh sink per
 * scan would restart seq and the daemon would idempotently drop everything).
 */
export function makeTraceSinkBinder(
  base: Omit<TraceSinkOptions, "subaccord" | "dispute">,
): (subaccord: string, dispute: string) => TraceSink {
  const cache = new Map<string, TraceSink>();
  return (subaccord, dispute) => {
    const key = `${subaccord}:${dispute}`;
    let sink = cache.get(key);
    if (sink === undefined) {
      sink = makeTraceSink({ ...base, subaccord, dispute });
      cache.set(key, sink);
    }
    return sink;
  };
}
