/**
 * settlement.ts — per-round settlement crank + dispute cancellation.
 *
 * `settle_round` is the permissionless per-round crank that settles a single
 * round's economics (slashing incoherent jurors + redistributing the pool) once
 * revealed. `cancel_dispute` refunds the filer's fee when a round fails to
 * reach a ruling within its timeout window — a permissionless timeout exit.
 *
 * Same ADR-0010 facade pattern: pure orchestration over a typed
 * {@link AccordSettlementClient} seam; Kit type-only; `remainingAccounts`
 * carry the JurorStake / Round / AppealBond PDAs the handlers mutate.
 *
 * Sources of truth:
 *   - settle_round:  programs/accord/src/lib.rs (1291)
 *   - cancel_dispute: programs/accord/src/lib.rs (1539)
 */
import type { Address, Instruction } from "@solana/kit";

/** Accounts for `settle_round`. */
export interface SettleRoundAccounts {
  /** Any caller (permissionless crank). Signer. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  round: Address;
}

export interface CancelDisputeAccounts {
  /** Any caller (permissionless crank). Signer. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  feeToken: Address;
  /** Filer's ATA — refund destination (owner checked on-chain). */
  filerTokenAccount: Address;
  feeVault: Address;
}

/** Accounts for `claim_filing_bounty` (ADR-0030). */
export interface ClaimFilingBountyAccounts {
  /** Any caller (permissionless crank). Signer. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  feeToken: Address;
  /** Filer's ATA — sweep destination (pinned to `dispute.filer` on-chain). */
  filerTokenAccount: Address;
  feeVault: Address;
}

/**
 * Seam to the Codama-generated Kit client (ADR-0010). Foundation wires the
 * concrete adapter; settlement.ts stays orchestration-only.
 */
export interface AccordSettlementClient {
  buildSettleRound(input: {
    programId: Address;
    accounts: SettleRoundAccounts;
    roundIdx: number;
    /** remaining_accounts: drawn JurorStake PDAs the crank mutates. */
    remainingAccounts: Address[];
  }): Instruction;
  buildCancelDispute(input: {
    programId: Address;
    accounts: CancelDisputeAccounts;
    /** remaining_accounts: Round + JurorStake + AppealBond PDAs. */
    remainingAccounts: Address[];
  }): Instruction;
  buildClaimFilingBounty(input: {
    programId: Address;
    accounts: ClaimFilingBountyAccounts;
  }): Instruction;
}

/**
 * Build the permissionless `settle_round` crank (lib.rs:1291). Settles one
 * round's economics after reveal — slashing incoherent jurors, redistributing
 * the pool. `roundIdx` selects the round; `remainingAccounts` are the drawn
 * JurorStake PDAs for that round (writable, mutated for slashes/rewards).
 */
export function settleRound(
  client: AccordSettlementClient,
  programId: Address,
  accounts: SettleRoundAccounts,
  roundIdx: number,
  remainingAccounts: Address[],
): Instruction {
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff) {
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  }
  return client.buildSettleRound({
    programId,
    accounts,
    roundIdx,
    remainingAccounts,
  });
}

/**
 * Build the permissionless `cancel_dispute` crank (lib.rs:1539). Refunds the
 * filer's fee when a round times out without a ruling. `remainingAccounts`
 * carries the Round + JurorStake + AppealBond PDAs the handler closes/refunds.
 */
export function cancelDispute(
  client: AccordSettlementClient,
  programId: Address,
  accounts: CancelDisputeAccounts,
  remainingAccounts: Address[],
): Instruction {
  return client.buildCancelDispute({
    programId,
    accounts,
    remainingAccounts,
  });
}

/**
 * Build the permissionless `claim_filing_bounty` crank (ADR-0030). Sweeps the
 * flip-bounty pool back to the filer when a dispute finalized WITHOUT ever
 * being appealed (`current_round == 0` at Final) — the filer's filing-time
 * `+1 · fee_per_juror` unit. Every other terminal shape disposes of the pool
 * elsewhere (finalize_dispute / the Failed transitions). Idempotent
 * on-chain (the pool is zeroed on payout).
 */
export function claimFilingBounty(
  client: AccordSettlementClient,
  programId: Address,
  accounts: ClaimFilingBountyAccounts,
): Instruction {
  return client.buildClaimFilingBounty({ programId, accounts });
}
