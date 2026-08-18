/**
 * caseDetail.ts — pure logic for the case-detail view (accord-9aoc).
 *
 * Three pieces, all mirroring on-chain semantics (programs/synod SPEC):
 *  - roster bitmasks (`joined` / `paidOut` are u8 bitfields, bit i = parties[i])
 *  - the manual-action state machine — the app half of the milestone's
 *    `resolveSynodAction` (the cranker's `synod-state.ts` mirrors this):
 *      Opening + full roster            → file_dispute (permissionless)
 *      Opening + deadline passed + partial → refund_roster_miss (per party)
 *      Live + dispute {Final, Failed}   → claim (per party)
 *  - payout preview mirroring on-chain `claim`: winner pot `N·S − fee`,
 *    neutral floor-share `⌊(N·S − fee)/N⌋` with the remainder to the last
 *    claimant, full `S` back on Failed.
 *
 * Plus `recoverCaseNonce`: `SynodCase` stores no seed backrefs (SPEC
 * §Instructions #3), so consumers re-derive the case-open nonce by probing
 * `["case", opener, nonce]` PDAs — valid because open uses sequential
 * probe-on-open nonces (NewCasePage).
 *
 * No React, no RPC — the page owns fetching + sending.
 */

import type { Address } from "@solana/kit";
import { DisputeState } from "@useaccord/sdk";
import { CaseState, findCasePda } from "@useaccord/synod";

/** `NO_RULING` sentinel on `Dispute.finalRuling` — u64::MAX (ADR-0025). */
export const NO_RULING = 0xffff_ffff_ffff_ffffn;

/** `Pubkey::default()` — the unbound-dispute sentinel on `SynodCase.dispute`. */
export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

export const CASE_STATE_LABELS: Record<CaseState, string> = {
  [CaseState.Opening]: "Opening — awaiting roster",
  [CaseState.Live]: "Live — before the court",
  [CaseState.Closed]: "Closed",
};

// --- roster masks -----------------------------------------------------------

/** Bitmask with the first `partyCount` bits set. */
export function fullMask(partyCount: number): number {
  return (1 << partyCount) - 1;
}

/** Number of set bits in a `joined`/`paidOut` mask. */
export function joinedCount(mask: number): number {
  let n = 0;
  for (; mask; mask >>= 1) n += mask & 1;
  return n;
}

/** Bit `i` of a mask — party `i` joined / paid. */
export function bitSet(mask: number, i: number): boolean {
  return ((mask >> i) & 1) === 1;
}

// --- manual-action state machine --------------------------------------------

export interface CaseView {
  state: CaseState;
  joined: number;
  paidOut: number;
  partyCount: number;
  joinDeadline: bigint;
}

export interface CaseActions {
  /** Opening + all parties joined → `file_dispute` (early lock, no deadline wait). */
  file: boolean;
  /** Opening + deadline passed + partial roster → `refund_roster_miss` per party. */
  refund: boolean;
  /** Live + dispute terminal (Final/Failed) → `claim` per party. */
  claim: boolean;
}

export function resolveCaseActions(
  c: CaseView,
  disputeState: DisputeState | null,
  nowSec: bigint,
): CaseActions {
  const full = c.state === CaseState.Opening && c.joined === fullMask(c.partyCount);
  return {
    file: full,
    refund:
      c.state === CaseState.Opening &&
      c.joined !== fullMask(c.partyCount) &&
      nowSec > c.joinDeadline,
    claim:
      c.state === CaseState.Live &&
      (disputeState === DisputeState.Final || disputeState === DisputeState.Failed),
  };
}

// --- payout preview (mirrors on-chain claim) --------------------------------

export type Payout =
  | { kind: "winner"; partyIndex: number; amount: bigint }
  | { kind: "neutral"; share: bigint; remainder: bigint }
  | { kind: "failed"; amount: bigint }
  | { kind: "pending" };

export function payoutPreview(
  c: { partyCount: number; stake: bigint; fee: bigint },
  dispute: { state: DisputeState; finalRuling: bigint } | null,
): Payout {
  if (
    !dispute ||
    (dispute.state !== DisputeState.Final && dispute.state !== DisputeState.Failed)
  ) {
    return { kind: "pending" };
  }
  if (dispute.state === DisputeState.Failed) {
    return { kind: "failed", amount: c.stake };
  }
  if (dispute.finalRuling === NO_RULING || dispute.finalRuling > BigInt(c.partyCount)) {
    return { kind: "pending" };
  }
  const pot = BigInt(c.partyCount) * c.stake - c.fee;
  if (dispute.finalRuling < BigInt(c.partyCount)) {
    return { kind: "winner", partyIndex: Number(dispute.finalRuling), amount: pot };
  }
  // Neutral (ruling == party_count): floor share, remainder to the last claimant.
  const n = BigInt(c.partyCount);
  return { kind: "neutral", share: pot / n, remainder: pot % n };
}

// --- nonce recovery -----------------------------------------------------------

/**
 * Re-derive the case-open nonce by probing `["case", opener, nonce]` PDAs
 * (0..maxScan). Returns `null` when the address isn't a case of `opener`
 * within the bound. Pure — PDA derivation only, no RPC.
 *
 * ponytail: linear scan bound — raise maxScan if open-time probing ever
 * exceeds it (probe-on-open keeps nonces small per opener).
 */
export async function recoverCaseNonce(
  opener: Address,
  caseAddress: Address,
  maxScan = 4096,
): Promise<bigint | null> {
  for (let n = 0; n <= maxScan; n++) {
    const [pda] = await findCasePda({ opener, nonce: BigInt(n) });
    if (pda === caseAddress) return BigInt(n);
  }
  return null;
}
