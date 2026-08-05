/**
 * chain/reader.ts — read-only on-chain views for the Evidence Operator daemon.
 *
 * Thin facade over `@accord/sdk` fetchers. The daemon writes nothing on-chain;
 * it reads three accounts to gate every request:
 *
 *   - `Subaccord` → `evidence_operator` (resolves the per-Subaccord key) +
 *     `evidence_spec` (pins the evidence/watermark scheme).
 *   - `Dispute`   → `subaccord` (locates the Subaccord), `evidence_hash`
 *     (integrity gate), `state` (delivery gate), `current_round`.
 *   - `Round`     → `jurors[]` — the **authoritative** drawn set. Events
 *     (`JurorsDrawn`) are cache hints only; this account is the truth.
 *
 * The SDK does not re-export the generated account data types, so this module
 * declares minimal view interfaces at the boundary (same pattern as the SDK's
 * own `DisputeRulingView` in packages/sdk/src/methods/dispute.ts). Fields not
 * consumed by the daemon are deliberately dropped — the daemon never needs
 * them, and a narrow view keeps the seam auditable.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"On-chain interface";
 * ADR-0006 (evidence model); milestone accord-yjno HANDOFF §1 §2.
 */

import type { Address, ReadonlyUint8Array } from "@solana/kit";
import {
  DisputeState,
  fetchDisputeMaybe,
  fetchRoundMaybe,
  fetchSubaccordMaybe,
  findRoundPda,
  type Accord,
} from "@accord/sdk";

/** Per-Subaccord fields the daemon consumes to resolve its key + scheme. */
export interface SubaccordView {
  /** Ed25519 pubkey whose Montgomery form is the ingest X25519 key. */
  readonly evidenceOperator: Address;
  /** Immutable evidence-format spec hash (ADR-0006); pins watermark scheme. */
  readonly evidenceSpec: ReadonlyUint8Array;
}

/** Per-Dispute fields the daemon consumes for key lookup + delivery gating. */
export interface DisputeView {
  /** Parent Subaccord — lookup key for the operator. */
  readonly subaccord: Address;
  /** On-chain evidence commitment; integrity gate target (`sha256(plaintext)`). */
  readonly evidenceHash: ReadonlyUint8Array;
  /** Lifecycle state; delivery requires `state >= Drawn`. */
  readonly state: DisputeState;
  /** Active round index — selects which `Round` PDA holds the drawn set. */
  readonly currentRound: number;
}

/**
 * Per-Round fields the daemon consumes. `jurors` is the Codama fixed-31 array;
 * only the first `jurorCount` entries are live (the rest are zero-pubkey fills).
 */
export interface RoundView {
  readonly roundIdx: number;
  /** Number of live entries at the front of `jurors`. */
  readonly jurorCount: number;
  /** Fixed-size 31; index `>= jurorCount` is padding, never a real draw. */
  readonly jurors: readonly Address[];
}

/**
 * Read a Subaccord's evidence-relevant fields, or `null` if the account does
 * not exist. The on-chain `evidence_operator` is the runtime key selector —
 * the daemon looks it up in its keyring map; an unknown operator yields `404`.
 */
export async function readSubaccord(
  accord: Accord,
  subaccord: Address,
): Promise<SubaccordView | null> {
  const m = await fetchSubaccordMaybe(accord, subaccord);
  if (!m.exists) return null;
  return {
    evidenceOperator: m.data.evidenceOperator,
    evidenceSpec: m.data.evidenceSpec,
  };
}

/**
 * Read a Dispute's delivery-relevant fields, or `null` if not found. Caller
 * holds the address (the SDK `Dispute` data shape omits it); pass it back into
 * {@link readRound} unchanged.
 */
export async function readDispute(
  accord: Accord,
  dispute: Address,
): Promise<DisputeView | null> {
  const m = await fetchDisputeMaybe(accord, dispute);
  if (!m.exists) return null;
  return {
    subaccord: m.data.subaccord,
    evidenceHash: m.data.evidenceHash,
    state: m.data.state,
    currentRound: m.data.currentRound,
  };
}

/**
 * Read a Round (authoritative drawn set) by deriving its PDA
 * `["round", dispute, u32_le(roundIdx)]` and fetching. Returns `null` if the
 * round has not been initialized (e.g. pre-draw). `roundIdx` is typically
 * `dispute.currentRound` for the active round.
 */
export async function readRound(
  accord: Accord,
  dispute: Address,
  roundIdx: number,
): Promise<RoundView | null> {
  const [roundAddress] = await findRoundPda({ dispute, roundIdx });
  const m = await fetchRoundMaybe(accord, roundAddress);
  if (!m.exists) return null;
  return {
    roundIdx: m.data.roundIdx,
    jurorCount: m.data.jurorCount,
    jurors: m.data.jurors,
  };
}

/**
 * Authoritative drawn-set membership. The `Round` account is the source of
 * truth — never trust the `JurorsDrawn` event alone. Only the first
 * `jurorCount` entries of the fixed-31 `jurors` array are real; the rest are
 * zero-pubkey padding and must not match any real juror.
 */
export function isDrawn(round: RoundView, juror: Address): boolean {
  for (let i = 0; i < round.jurorCount; i++) {
    if (round.jurors[i] === juror) return true;
  }
  return false;
}

/**
 * Delivery state gate: a dispute is deliverable once its lifecycle has reached
 * `Drawn` or beyond (Review/Commit/Reveal/RoundResolved/Final). Per the
 * HANDOFF, the check is `state >= Drawn`; retention cleanup post-`Final` is
 * the storage layer's concern, not the reader's.
 */
export function isDeliverable(dispute: DisputeView): boolean {
  return dispute.state >= DisputeState.Drawn;
}
