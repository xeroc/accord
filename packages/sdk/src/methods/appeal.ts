/**
 * appeal.ts — dispute appeal + bond refund (ADR-0004).
 *
 * `appeal` is permissionless: any appellant pays the new (larger) round's fee
 * plus an equal bond, opening round `current_round + 1` with a `2N+1` panel
 * and resetting the dispute to `Created` so snapshot→draw→vote reruns. The
 * bond is custodied in a per-appeal `AppealBond` PDA keyed by the round it
 * opened.
 *
 * `claim_appeal_refund` returns a FLIPPED bond to its appellant after
 * `finalize_dispute` (no-flip bonds are folded into the coherent pool there).
 * Idempotent: zeroing the bond on payout makes re-invocation a no-op.
 *
 * Client-side helpers mirror the on-chain appeal ladder (`panel_size_for_round`,
 * lib.rs:1563) and cost math so the facade can quote a panel + fee before
 * sending. Same ADR-0010 facade pattern: Kit type-only, PDA lazy.
 *
 * Sources of truth:
 *   - appeal / claim_appeal_refund: lib.rs (1374-1524)
 *   - Appeal / ClaimAppealRefund accounts: lib.rs (2212-2303)
 *   - AppealBond struct + seeds: state.rs (174-193)  `["bond", dispute, round_idx]`
 *   - appeal ladder: lib.rs:1540-1577, ADR-0004
 */
import type { Address, Instruction } from "@solana/kit";
import { MAX_JURORS, panelSizeForRound } from "../constants.js";

export {
  MAX_JURORS,
  APPEAL_WINDOW_SECS,
  panelSizeForRound,
} from "../constants.js";

/** AppealBond PDA seed prefix (state.rs: SEED_APPEAL_BOND = b"bond"). */
const SEED_APPEAL_BOND = new Uint8Array([98, 111, 110, 100]); // "bond"

// ---------------------------------------------------------------------------
// Pure helpers (mirror on-chain math, testable)
// ---------------------------------------------------------------------------

/** u32 → 4-byte little-endian. */
function le4(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

/**
 * Required panel size for round `roundIdx` — the appeal ladder
 * `N_{k+1} = 2·N_k + 1` (closed form `(J+1)·2^k − 1`), capped at
 * {@link MAX_JURORS}. Direct port of `panel_size_for_round` (lib.rs:1563).
 * Returns `null` on overflow (round_idx ≥ 31).
 *
 * Re-exported from {@link ../constants.js} for module-internal use.
 */

/** Appeal cost breakdown for opening round `currentRound + 1` (lib.rs:1416-1430). */
export interface AppealCost {
  newRound: number;
  panel: number;
  /** New-round fee = panel · fee_per_juror. */
  fee: bigint;
  /** Bond == new-round fee (forfeited if no flip, returned if flipped). */
  bond: bigint;
  /** Appellant pays fee + bond up front. */
  total: bigint;
}

/**
 * Quote the panel + fee + bond for an appeal from `currentRound`. Mirrors
 * lib.rs:1416-1430 (`panel_new = panel_size_for_round(J, current+1)`,
 * `fee_new = panel_new · fee_per_juror`, `bond = fee_new`,
 * `total = fee_new + bond`). Returns `null` if the panel math overflows.
 */
export function appealCost(
  jurorsPerDispute: number,
  currentRound: number,
  feePerJuror: bigint,
): AppealCost | null {
  const newRound = currentRound + 1;
  const panel = panelSizeForRound(jurorsPerDispute, newRound);
  if (panel === null) return null;
  const fee = BigInt(panel) * feePerJuror;
  const bond = fee;
  return { newRound, panel, fee, bond, total: fee + bond };
}

/** Gate: a fresh appeal requires `currentRound < maxAppeals` (lib.rs:1386). */
export function canAppeal(currentRound: number, maxAppeals: number): boolean {
  return currentRound < maxAppeals;
}

/** AppealBond PDA seeds (state.rs:2286): `["bond", dispute, round_idx_le4]`. */
export function appealBondSeeds(
  disputeBytes: Uint8Array,
  roundIdx: number,
): Uint8Array[] {
  if (disputeBytes.length !== 32)
    throw new Error("InvalidDispute: expected 32 bytes");
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff) {
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  }
  return [SEED_APPEAL_BOND, disputeBytes, le4(roundIdx)];
}

// ---------------------------------------------------------------------------
// PDA derivation (Kit lazy-imported)
// ---------------------------------------------------------------------------

export async function findAppealBondPda(
  programAddress: Address,
  dispute: Address,
  roundIdx: number,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } =
    await import("@solana/kit");
  const disputeBytes = new Uint8Array(getAddressEncoder().encode(dispute));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: appealBondSeeds(disputeBytes, roundIdx),
  });
  return { address, bump };
}

// ---------------------------------------------------------------------------
// Seam (ADR-0010) + orchestration
// ---------------------------------------------------------------------------

/** Accounts for `appeal`. */
export interface AppealAccounts {
  /** Any appellant (permissionless). Fee + bond payer. Signer. */
  appellant: Address;
  subaccord: Address;
  pauseState: Address;
  dispute: Address;
  /** The just-resolved round (`current_round`) — read for `prior_result`. */
  round: Address;
  /** AppealBond PDA for the NEW round (`["bond", dispute, current_round+1]`). */
  appealBond: Address;
  stakingToken: Address;
  appellantTokenAccount: Address;
  vault: Address;
}

/** Accounts for `claim_appeal_refund`. */
export interface ClaimRefundAccounts {
  /** Any caller (permissionless crank). Signer. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  /** AppealBond PDA for `roundIdx` (the round the appeal opened). */
  appealBond: Address;
  stakingToken: Address;
  /** Appellant's ATA — sweep destination (owner checked on-chain). */
  claimantTokenAccount: Address;
  vault: Address;
}

/**
 * Seam to the Codama-generated Kit client. Foundation wires the concrete
 * adapter; appeal.ts stays orchestration-only.
 */
export interface AccordAppealClient {
  buildAppeal(input: {
    programId: Address;
    accounts: AppealAccounts;
  }): Instruction;
  buildClaimAppealRefund(input: {
    programId: Address;
    accounts: ClaimRefundAccounts;
    roundIdx: number;
  }): Instruction;
}

/**
 * Build `appeal` (lib.rs:1374). Opens `current_round + 1` with a `2N+1` panel;
 * the appellant pays `fee_new + bond` (bond == fee_new). The AppealBond PDA is
 * keyed by the new round — derive it via {@link findAppealBondPda} with
 * `currentRound + 1`.
 */
export function appeal(
  client: AccordAppealClient,
  programId: Address,
  accounts: AppealAccounts,
): Instruction {
  return client.buildAppeal({ programId, accounts });
}

/**
 * Build `claim_appeal_refund` (lib.rs:1481) for a specific appeal's bond.
 * `roundIdx` is the round the appeal OPENED (the value of `current_round + 1`
 * at appeal time) — it selects which `AppealBond` PDA to claim. Idempotent
 * on-chain (the bond is zeroed on payout).
 */
export function claimAppealRefund(
  client: AccordAppealClient,
  programId: Address,
  accounts: ClaimRefundAccounts,
  roundIdx: number,
): Instruction {
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff) {
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  }
  return client.buildClaimAppealRefund({ programId, accounts, roundIdx });
}
