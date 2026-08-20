/**
 * chain/reader.ts — read-only on-chain views for the Evidence Operator daemon.
 *
 * Thin facade over `@useaccord/sdk` fetchers. The daemon writes nothing on-chain;
 * it reads three accounts to gate every request:
 *
 *   - `Subaccord` → `evidence_operator` (resolves the per-Subaccord key) +
 *     `evidence_spec` (pins the evidence/watermark scheme).
 *   - `Dispute`   → `subaccord` (locates the Subaccord), `evidence_hashes`
 *     (per-round integrity gate, ADR-0023), `state` (delivery gate),
 *     `current_round`.
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
} from "@useaccord/sdk";
import { fetchMaybeSynodCase } from "@useaccord/synod";

/** Per-Subaccord fields the daemon consumes to resolve its key + scheme. */
export interface SubaccordView {
  /** Ed25519 pubkey whose Montgomery form is the ingest X25519 key. */
  readonly evidenceOperator: Address;
  /** Immutable evidence-format spec hash (ADR-0006); pins watermark scheme. */
  readonly evidenceSpec: ReadonlyUint8Array;
  /**
   * `sha256(domain doc)` — the public CAS anchor (ADR-0027 as amended).
   * Gates `PUT /domains/{hash}`: the hash must equal this field.
   */
  readonly domainRef: ReadonlyUint8Array;
}

export interface DisputeView {
  /** Parent Subaccord — lookup key for the operator. */
  readonly subaccord: Address;
  /** Dispute filer — a SynodCase PDA when the dispute is synod-backed. */
  readonly filer: Address;
  /**
   * Per-round evidence commitments (ADR-0023): index 0 = filer, 1..MAX_APPEALS
   * = appeal rounds; `[0u8;32]` = sentinel ("no new evidence this round"). The
   * per-round integrity gate target is `sha256(plaintext) == evidenceHashes[k]`.
   */
  readonly evidenceHashes: readonly ReadonlyUint8Array[];
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
  const m = await fetchSubaccordMaybe(accord.rpc, subaccord);
  if (!m.exists) return null;
  return {
    evidenceOperator: m.data.evidenceOperator,
    evidenceSpec: m.data.evidenceSpec,
    domainRef: m.data.domainRef,
  };
}

/**
 * Read a Dispute's delivery-relevant fields, or `null` if not found. Caller
 * holds the address (the SDK `Dispute` data shape omits it); pass it back into
 * {@link readRound} unchanged.
 */
export async function readDispute(accord: Accord, dispute: Address): Promise<DisputeView | null> {
  const m = await fetchDisputeMaybe(accord.rpc, dispute);
  if (!m.exists) return null;
  return {
    subaccord: m.data.subaccord,
    filer: m.data.filer,
    evidenceHashes: m.data.evidenceHashes,
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
  const m = await fetchRoundMaybe(accord.rpc, roundAddress);
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

/** Per-SynodCase fields the daemon consumes for pre-dispute grouping (accord-1viq). */
export interface SynodCaseView {
  /** Hosting Subaccord — store-key prefix + operator-key selector. */
  readonly subaccord: Address;
  /** Live roster size (2..7); valid evidence slots are `0..partyCount-1`. */
  readonly partyCount: number;
  /**
   * The bound Accord Dispute PDA; the System-program id (all-zero pubkey) is
   * the sentinel while the case is pre-file. Non-sentinel ⇒ pushes are 409.
   */
  readonly dispute: Address;
}

/**
 * Read a SynodCase's evidence-relevant fields, or `null` if the address does
 * not hold one. Backs the pre-dispute grouping gate (`POST
 * /evidence/synod/:case/:party`) and the deliver bridge — where the filer is
 * an ARBITRARY pubkey, usually not a case, so a decode/discriminator mismatch
 * maps to `null` ("not a SynodCase") instead of throwing.
 */
export async function readSynodCase(
  accord: Accord,
  casePda: Address,
): Promise<SynodCaseView | null> {
  try {
    const m = await fetchMaybeSynodCase(accord.rpc, casePda);
    if (!m.exists) return null;
    return {
      subaccord: m.data.subaccord,
      partyCount: m.data.partyCount,
      dispute: m.data.dispute,
    };
  } catch {
    return null; // wrong program / not a SynodCase — the common case at a filer
  }
}
