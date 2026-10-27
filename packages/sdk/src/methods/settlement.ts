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
import type { Account, Address, GetAccountInfoApi, Instruction, Rpc } from "@solana/kit";
import { fetchRoundMaybe } from "../fetch.js";
import {
  findAppealBondPda,
  findJurorStakePda,
  findRoundPda,
} from "../pda.js";
import type { Round } from "../generated/accounts/round.js";

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
 * filer's fee when a round times out without a ruling. Derive
 * `remainingAccounts` with {@link deriveCancelDisputeRemainingAccounts} — the
 * handler's strict accounting rejects any other layout.
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

/** Sentinel in `Round.jurors` for an unfilled seat (the SystemProgram id). */
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111" as Address;

/**
 * Derive `cancel_dispute`'s `remainingAccounts`, mirroring the on-chain
 * strict accounting (programs/accord/src/instructions/cancel_dispute.rs):
 *
 * 1. the current Round PDA + its panel's JurorStake PDAs — ONLY while
 *    `drawnSeats > 0`: `draw_seat` creates the Round, so a never-drawn
 *    dispute (dead VRF oracle — the classic pre-draw stall) has no account
 *    and the handler requires an EMPTY list.
 * 2. every prior Round (`0..currentRound`) + its panel, ascending —
 *    `release_prior_rounds`.
 * 3. one AppealBond PDA per appeal (`0..currentRound`) —
 *    `credit_bond_bounty_units`. Bond PDA seeds are the round BEING appealed
 *    (0-based appeal index); the bond's `roundIdx` FIELD records the round
 *    the appeal OPENED (seed + 1) — do not confuse them.
 *
 * A juror drawn into several rounds appears once per round — the handler
 * counts occurrences, not addresses. (bean accord-br6a: the cranker, CLI,
 * and reconciler each drifted from this layout independently; it lives here
 * as the single source.)
 */
export async function deriveCancelDisputeRemainingAccounts(
  rpc: Rpc<GetAccountInfoApi>,
  programId: Address,
  dispute: Address,
  subaccord: Address,
  currentRound: number,
  drawnSeats: number,
): Promise<Address[]> {
  const out: Address[] = [];
  const pushRound = async (roundIdx: number): Promise<void> => {
    const [roundAddress] = await findRoundPda(
      { dispute, roundIdx },
      { programAddress: programId },
    );
    out.push(roundAddress);
    const account = await fetchRoundMaybe(rpc, roundAddress);
    if (!account.exists) {
      throw new Error(
        `RoundNotFound: ${roundAddress} (dispute ${dispute}, round ${roundIdx})`,
      );
    }
    for (const juror of (account as Account<Round>).data.jurors) {
      if (juror === SYSTEM_PROGRAM_ID) continue; // unfilled seat sentinel
      const [stakeAddress] = await findJurorStakePda(
        { subaccord, juror },
        { programAddress: programId },
      );
      out.push(stakeAddress);
    }
  };
  if (drawnSeats > 0) await pushRound(currentRound);
  for (let r = 0; r < currentRound; r++) await pushRound(r);
  for (let r = 0; r < currentRound; r++) {
    const [bondAddress] = await findAppealBondPda(
      { dispute, roundIdx: r },
      { programAddress: programId },
    );
    out.push(bondAddress);
  }
  return out;
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
