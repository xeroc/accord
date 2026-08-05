/**
 * chain/events.ts — off-chain event subscriber for the Evidence Operator daemon.
 *
 * The daemon **writes nothing** on-chain. It reads three accounts to gate every
 * request (see {@link "./reader.ts"}); this module subscribes to the Accord
 * program's transaction logs purely as *hints*:
 *
 *   - `DisputeCreated`  → indexing wake-up (ciphertext was already ingested at
 *                         file time via POST; this just signals the on-chain
 *                         Dispute now exists).
 *   - `JurorsDrawn`     → mark a dispute deliverable in cache. The authoritative
 *                         drawn set is the live `Round` account — the event's
 *                         `jurors` list is a convenience hint, NEVER the gate.
 *   - `RulingFinalized` → retention sweep trigger (evidence bundle may age out
 *                         once the dispute is final).
 *
 * **Cache only — reader is the source of truth.** Every delivery still re-reads
 * `Round.jurors[]` + `Dispute.state` via the reader; an event arriving out of
 * order, duplicated, or for a reverted transaction must never flip a real gate.
 * Handlers are best-effort: a parse failure or a thrown callback is swallowed
 * (logged by the caller) so the subscription never dies on a single bad log.
 *
 * Anchor encodes events via `sol_log_data`: each event is a single log line
 *
 *     Program data: <base64( discriminator(8) || borsh(payload) )>
 *
 * where the discriminator is `sha256("event:<EventName>")[0..8]`. The three
 * discriminators are precomputed below so decoding stays sync and
 * allocation-free; field order/borsh layout mirrors `programs/accord/src/events.rs`.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"On-chain interface";
 * ADR-0006 (evidence model); milestone accord-yjno HANDOFF §1.
 */

import {
  fixDecoderSize,
  getArrayDecoder,
  getAddressDecoder,
  getBase64Encoder,
  getBytesDecoder,
  getStructDecoder,
  getU8Decoder,
  getU32Decoder,
  type Address,
  type ReadonlyUint8Array,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

// ---------------------------------------------------------------------------
// Event discriminators — sha256("event:<Name>")[0..8] (see programs/accord events.rs).
// Hard-coded (deterministic over the type name) so decode is sync + zero-alloc.
// ---------------------------------------------------------------------------

const DISCRIM_DISPUTE_CREATED = new Uint8Array([
  0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d,
]);
const DISCRIM_JURORS_DRAWN = new Uint8Array([
  0x98, 0x69, 0x4a, 0xe2, 0xb5, 0xde, 0x89, 0x41,
]);
const DISCRIM_RULING_FINALIZED = new Uint8Array([
  0xbf, 0x58, 0xc2, 0x3f, 0x8e, 0x29, 0xa8, 0x46,
]);

// ---------------------------------------------------------------------------
// Typed event payloads — narrow views of the on-chain events. Fields the daemon
// never consumes are dropped (e.g. DisputeCreated.num_options is exposed for
// completeness but unused; the integrity gate reads `Dispute.evidence_hash`).
// ---------------------------------------------------------------------------

/** `DisputeCreated` — signals a Dispute account exists; indexing wake-up hint. */
export interface DisputeCreatedEvent {
  readonly kind: "DisputeCreated";
  readonly dispute: Address;
  readonly subaccord: Address;
  readonly filer: Address;
  readonly numOptions: number;
}

/**
 * `JurorsDrawn` — cache hint that a dispute is now deliverable. `jurors` is the
 * event's view; delivery MUST re-verify against the live `Round.jurors[]`
 * (reader source of truth) — never trust this list as the membership gate.
 */
export interface JurorsDrawnEvent {
  readonly kind: "JurorsDrawn";
  readonly dispute: Address;
  readonly roundIdx: number;
  readonly jurors: readonly Address[];
  /** VRF sortition seed (audit trail only; daemon does not re-run sortition). */
  readonly vrfSeed: ReadonlyUint8Array;
}

/** `RulingFinalized` — retention sweep trigger for the dispute's evidence bundle. */
export interface RulingFinalizedEvent {
  readonly kind: "RulingFinalized";
  readonly dispute: Address;
  readonly ruling: number;
}

/** Union of the three events the daemon subscribes to. */
export type AccordEvent =
  DisputeCreatedEvent | JurorsDrawnEvent | RulingFinalizedEvent;

/**
 * Best-effort handler set. Any handler that throws is swallowed (and reported
 * via {@link AccordEventHandlers.onError} if provided) so one bad hint can't
 * kill the subscription. Handlers are optional; unset kinds are ignored.
 */
export interface AccordEventHandlers {
  onDisputeCreated?(e: DisputeCreatedEvent): void;
  onJurorsDrawn?(e: JurorsDrawnEvent): void;
  onRulingFinalized?(e: RulingFinalizedEvent): void;
  /** Invoked for a decode/parse miss or a thrown handler; never fatal. */
  onError?(err: unknown, raw: string): void;
}

// ---------------------------------------------------------------------------
// Decoders — one struct per event, borsh layout (LE numbers, u32 Vec prefix).
// Operate on the payload *after* the 8-byte discriminator is sliced off.
// ---------------------------------------------------------------------------

const decodeDisputeCreatedFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["subaccord", getAddressDecoder()],
  ["filer", getAddressDecoder()],
  ["numOptions", getU8Decoder()],
]);

const decodeJurorsDrawnFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["roundIdx", getU32Decoder()],
  // borsh Vec<Pubkey> = u32-LE count ++ N×32; kit's array default matches.
  ["jurors", getArrayDecoder(getAddressDecoder())],
  ["vrfSeed", fixDecoderSize(getBytesDecoder(), 32)],
]);

const decodeRulingFinalizedFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["ruling", getU8Decoder()],
]);

// ---------------------------------------------------------------------------
// Pure decode helpers (no I/O — fully testable).
// ---------------------------------------------------------------------------

const PROGRAM_DATA_PREFIX = "Program data: ";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Decode a raw event record `<discriminator(8) || borsh(payload)>` into a typed
 * event, or `null` if the discriminator is not one of the three the daemon
 * tracks (or the payload is malformed). Never throws — a missed hint is a
 * no-op; the reader remains the source of truth.
 */
export function decodeAccordEvent(
  record: ReadonlyUint8Array,
): AccordEvent | null {
  if (record.length < 8) return null;
  const disc = record.subarray(0, 8) as Uint8Array;
  const payload = record.subarray(8) as Uint8Array;
  try {
    if (bytesEqual(disc, DISCRIM_DISPUTE_CREATED)) {
      const f = decodeDisputeCreatedFields.decode(payload);
      return { kind: "DisputeCreated", ...f };
    }
    if (bytesEqual(disc, DISCRIM_JURORS_DRAWN)) {
      const f = decodeJurorsDrawnFields.decode(payload);
      return { kind: "JurorsDrawn", ...f };
    }
    if (bytesEqual(disc, DISCRIM_RULING_FINALIZED)) {
      const f = decodeRulingFinalizedFields.decode(payload);
      return { kind: "RulingFinalized", ...f };
    }
  } catch {
    return null;
  }
  return null;
}

// `getBase64Encoder` is Kit's base64-string → raw-bytes direction (the codec
// is named from the value's perspective: a base64 string is the *value*).
const base64ToBytes = getBase64Encoder();

/**
 * Parse one transaction log line into a typed event, or `null`.
 *
 * Anchor events arrive as `Program data: <base64>` lines; other log lines
 * (instruction markers, system messages, other programs' data) yield `null`.
 * The base64 payload decodes to the full `discriminator || payload` record
 * passed to {@link decodeAccordEvent}. Never throws.
 */
export function parseAccordLog(line: string): AccordEvent | null {
  const idx = line.indexOf(PROGRAM_DATA_PREFIX);
  if (idx < 0) return null;
  const b64 = line.slice(idx + PROGRAM_DATA_PREFIX.length).trim();
  if (!b64) return null;
  let record: ReadonlyUint8Array;
  try {
    record = base64ToBytes.encode(b64);
  } catch {
    return null;
  }
  return decodeAccordEvent(record);
}

/**
 * Decode every `Program data:` event embedded in a transaction's full log set.
 * A single transaction can carry multiple events (e.g. a `draw` that also
 * finalizes a prior round); each is yielded independently, in log order.
 */
export function parseAccordLogs(
  logs: readonly string[],
): readonly AccordEvent[] {
  const out: AccordEvent[] = [];
  for (const line of logs) {
    const ev = parseAccordLog(line);
    if (ev) out.push(ev);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Subscription — wires the pure decoders to a Kit websocket logs stream.
// ---------------------------------------------------------------------------

/**
 * Subscribe to the Accord program's transaction logs and dispatch typed hints
 * to {@link handlers}. Runs until the {@link signal} aborts, then resolves.
 *
 * The filter is `mentions: [programId]`, so only transactions that touch the
 * Accord program arrive — minimising noise. Every notification's logs are
 * parsed for the three tracked events; unrecognised data lines are ignored.
 *
 * Resilience contract: a thrown handler, a malformed payload, or a transient
 * channel error is reported via {@link AccordEventHandlers.onError} and the
 * loop continues — events are *hints*, never authoritative. If the caller
 * wants fatal-on-disconnect behaviour, observe the returned promise's
 * rejection (the Kit transport surfaces channel-fatal errors there).
 *
 * @param rpcSubscriptions a Kit subscriptions handle (e.g. from `createSolanaRpcSubscriptions(wsUrl)`)
 * @param programId        the Accord program address
 * @param handlers         best-effort typed callbacks
 * @param signal           abort to tear the subscription down
 */
export async function subscribeAccordEvents(
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  programId: Address,
  handlers: AccordEventHandlers,
  signal: AbortSignal,
): Promise<void> {
  const notifications = await rpcSubscriptions
    .logsNotifications({ mentions: [programId] })
    .subscribe({ abortSignal: signal });

  for await (const notification of notifications) {
    const logs = notification?.value?.logs;
    if (!logs) continue;
    for (const event of parseAccordLogs(logs)) {
      dispatch(handlers, event, logs.join("\n"));
    }
  }
}

/** Route one typed event to its handler, swallowing any throw. */
function dispatch(
  handlers: AccordEventHandlers,
  event: AccordEvent,
  raw: string,
): void {
  try {
    switch (event.kind) {
      case "DisputeCreated":
        handlers.onDisputeCreated?.(event);
        break;
      case "JurorsDrawn":
        handlers.onJurorsDrawn?.(event);
        break;
      case "RulingFinalized":
        handlers.onRulingFinalized?.(event);
        break;
    }
  } catch (err) {
    handlers.onError?.(err, raw);
  }
}
