/**
 * events.ts — WS log-subscription hints for Jurat (bean accord-vp5r, feature
 * accord-24o6; milestone accord-g69g decision 4).
 *
 * Tracks the four events Jurat cares about as *hints*:
 *
 *   - `SubaccordCreated` → a new pool to evaluate against the join gates
 *   - `DisputeCreated`   → context: a dispute exists on a (possibly joined) pool
 *   - `SeatDrawn`        → a seat was assigned — check whether it is OURS
 *   - `Redrawn`          → a panel was redrawn — prior seats may be stale
 *
 * Accounts stay authoritative: the boot/periodic reconcile scan
 * (./reconcile.ts) re-derives the truth; these hints only make Jurat timely.
 * Pattern and resilience contract mirror the evidence daemon's
 * `chain/events.ts`: best-effort handlers never kill the subscription, and a
 * malformed payload is swallowed (reported via `onError`) rather than fatal.
 *
 * Layouts are the on-chain borsh layouts (programs/accord events.rs):
 * little-endian numbers, 8-byte Anchor event discriminator
 * `sha256("event:<Name>")[0..8]` prepended to the record.
 */

import {
  fixDecoderSize,
  getAddressDecoder,
  getBase64Encoder,
  getBytesDecoder,
  getStructDecoder,
  getU32Decoder,
  getU8Decoder,
  type Address,
  type ReadonlyUint8Array,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

// ---------------------------------------------------------------------------
// Event discriminators — sha256("event:<Name>")[0..8] (programs/accord
// events.rs). Hard-coded (deterministic over the type name) so decode is
// sync + zero-alloc.
// ---------------------------------------------------------------------------

const DISCRIM_SUBACCORD_CREATED = new Uint8Array([
  0xcd, 0x6d, 0x5f, 0x9a, 0x89, 0x80, 0x6f, 0x55,
]);
const DISCRIM_SEAT_DRAWN = new Uint8Array([
  0x6e, 0x3d, 0x2f, 0x28, 0x0c, 0xdd, 0xdd, 0x7a,
]);
const DISCRIM_REDRAWN = new Uint8Array([
  0x45, 0x5d, 0x7a, 0x1d, 0x20, 0x60, 0xdc, 0xd1,
]);
const DISCRIM_DISPUTE_CREATED = new Uint8Array([
  0xfe, 0xca, 0x33, 0x7b, 0x64, 0x98, 0x89, 0x5d,
]);

// ---------------------------------------------------------------------------
// Typed event payloads — camelCase views of the on-chain structs.
// ---------------------------------------------------------------------------

/** `SubaccordCreated` — a new pool exists; join-gate wake-up hint. */
export interface SubaccordCreatedEvent {
  readonly kind: "SubaccordCreated";
  readonly creator: Address;
  readonly subaccord: Address;
  readonly stakingToken: Address;
  readonly feeToken: Address;
  readonly domainRef: ReadonlyUint8Array;
}

/**
 * `SeatDrawn` — one seat was assigned. The composition layer checks
 * `juror === ourKey`; membership is re-verified against `Round.jurors[]` by
 * the reconcile scan before anything is acted on (hints are not truth).
 */
export interface SeatDrawnEvent {
  readonly kind: "SeatDrawn";
  readonly dispute: Address;
  readonly roundIdx: number;
  readonly seat: number;
  readonly juror: Address;
}

/** `Redrawn` — the panel for `(dispute, round_idx)` was redrawn. */
export interface RedrawnEvent {
  readonly kind: "Redrawn";
  readonly dispute: Address;
  readonly roundIdx: number;
  readonly drawAttempt: number;
}

/** `DisputeCreated` — a Dispute account exists; indexing wake-up hint. */
export interface DisputeCreatedEvent {
  readonly kind: "DisputeCreated";
  readonly dispute: Address;
  readonly subaccord: Address;
  readonly filer: Address;
  readonly numOptions: number;
}

/** Union of the four events Jurat subscribes to. */
export type AccordEvent =
  | SubaccordCreatedEvent
  | SeatDrawnEvent
  | RedrawnEvent
  | DisputeCreatedEvent;

/**
 * Best-effort handler set. Any handler that throws is swallowed (and
 * reported via {@link AccordEventHandlers.onError}) so one bad hint can't
 * kill the subscription. Handlers are optional; unset kinds are ignored.
 */
export interface AccordEventHandlers {
  onSubaccordCreated?(e: SubaccordCreatedEvent): void;
  onSeatDrawn?(e: SeatDrawnEvent): void;
  onRedrawn?(e: RedrawnEvent): void;
  onDisputeCreated?(e: DisputeCreatedEvent): void;
  /** Invoked for a decode/parse miss or a thrown handler; never fatal. */
  onError?(err: unknown, raw: string): void;
}

// ---------------------------------------------------------------------------
// Decoders — one struct per event, borsh layout. Operate on the payload
// *after* the 8-byte discriminator is sliced off.
// ---------------------------------------------------------------------------

const decodeSubaccordCreatedFields = getStructDecoder([
  ["creator", getAddressDecoder()],
  ["subaccord", getAddressDecoder()],
  ["stakingToken", getAddressDecoder()],
  ["feeToken", getAddressDecoder()],
  ["domainRef", fixDecoderSize(getBytesDecoder(), 32)],
]);

const decodeSeatDrawnFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["roundIdx", getU32Decoder()],
  ["seat", getU32Decoder()],
  ["juror", getAddressDecoder()],
]);

const decodeRedrawnFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["roundIdx", getU32Decoder()],
  ["drawAttempt", getU32Decoder()],
]);

const decodeDisputeCreatedFields = getStructDecoder([
  ["dispute", getAddressDecoder()],
  ["subaccord", getAddressDecoder()],
  ["filer", getAddressDecoder()],
  ["numOptions", getU8Decoder()],
]);

// ---------------------------------------------------------------------------
// Pure decode helpers (no I/O — fully testable).
// ---------------------------------------------------------------------------

const PROGRAM_DATA_PREFIX = "Program data: ";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
/**
 * Decode a raw event record `<discriminator(8) || borsh(payload)>` into a
 * typed event. Returns `null` for an unknown discriminator or a payload
 * that does not decode (foreign / stale / corrupt data) — never throws.
 */
export function decodeAccordEvent(
  record: ReadonlyUint8Array,
): AccordEvent | null {
  if (record.length < 8) return null;
  const disc = record.subarray(0, 8) as Uint8Array;
  const body = record.subarray(8) as Uint8Array;
  try {
    if (bytesEqual(disc, DISCRIM_SUBACCORD_CREATED)) {
      return { kind: "SubaccordCreated", ...decodeSubaccordCreatedFields.decode(body) };
    }
    if (bytesEqual(disc, DISCRIM_SEAT_DRAWN)) {
      return { kind: "SeatDrawn", ...decodeSeatDrawnFields.decode(body) };
    }
    if (bytesEqual(disc, DISCRIM_REDRAWN)) {
      return { kind: "Redrawn", ...decodeRedrawnFields.decode(body) };
    }
    if (bytesEqual(disc, DISCRIM_DISPUTE_CREATED)) {
      return { kind: "DisputeCreated", ...decodeDisputeCreatedFields.decode(body) };
    }
  } catch {
    return null;
  }
  return null;
}

// `getBase64Encoder` is Kit's base64-string → raw-bytes direction.
const base64ToBytes = getBase64Encoder();

/**
 * Parse one transaction log line into a typed event, or `null`. Lines
 * without a `Program data:` record, malformed base64, or foreign payloads
 * all return `null` — a bad line is a missed hint, never an error.
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
 * Decode every `Program data:` event embedded in a transaction's full log
 * set, in log order. A single transaction can carry multiple tracked events.
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
 * The filter is `mentions: [programId]`, so only transactions touching the
 * Accord program arrive. Resilience contract: a thrown handler or malformed
 * payload is reported via `onError` and the loop continues — hints are never
 * authoritative. Channel-fatal errors surface as a rejection of the returned
 * promise (the caller decides whether to reconnect; the reconcile scan
 * remains the catch-up path).
 *
 * @param rpcSubscriptions a Kit subscriptions handle (`createSolanaRpcSubscriptions(wsUrl)`)
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
      dispatchAccordEvent(handlers, event, logs.join("\n"));
    }
  }
}

/** Route one typed event to its handler, swallowing any throw. */
export function dispatchAccordEvent(
  handlers: AccordEventHandlers,
  event: AccordEvent,
  raw: string,
): void {
  try {
    switch (event.kind) {
      case "SubaccordCreated":
        handlers.onSubaccordCreated?.(event);
        break;
      case "SeatDrawn":
        handlers.onSeatDrawn?.(event);
        break;
      case "Redrawn":
        handlers.onRedrawn?.(event);
        break;
      case "DisputeCreated":
        handlers.onDisputeCreated?.(event);
        break;
    }
  } catch (err) {
    handlers.onError?.(err, raw);
  }
}
