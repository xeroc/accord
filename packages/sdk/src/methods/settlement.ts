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

/** Accounts for `cancel_dispute`. */
export interface CancelDisputeAccounts {
  /** Any caller (permissionless crank). Signer. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  stakingToken: Address;
  /** Filer's ATA — refund destination (owner checked on-chain). */
  filerTokenAccount: Address;
  vault: Address;
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
