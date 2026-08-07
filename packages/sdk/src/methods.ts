/**
 * Bound orchestration namespace — the eight Accord method groups, pre-bound to
 * a concrete {@link AccordAdapter} + the canonical program id.
 *
 * Each entry forwards to the pure orchestration function in `src/methods/*.ts`,
 * injecting the adapter as the `client` argument. The pure crypto helpers
 * (`buildMst`, `resolvePanel`, `commitHash`, `appealCost`, …) are NOT bound
 * here — they take no client, so import them directly from `@accord/sdk`.
 *
 * @see ADR-0010
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";

import {
  createDispute as pureCreateDispute,
  getRuling as pureGetRuling,
  type CreateDisputeAccounts,
  type CreateDisputeArgs,
} from "./methods/dispute.js";
import {
  createSubaccord as pureCreateSubaccord,
  executeSubaccordUpdate as pureExecuteSubaccordUpdate,
  executeUnpause as pureExecuteUnpause,
  getUpdateExecuteAfterSlot as pureGetUpdateExecuteAfterSlot,
  initializePause as pureInitializePause,
  pause as purePause,
  proposeSubaccordUpdate as pureProposeSubaccordUpdate,
  proposeUnpause as pureProposeUnpause,
  type CreateSubaccordArgs,
  type UpdatePayload,
} from "./methods/lifecycle.js";
import type { MSTNode } from "./methods/mst.js";
import {
  stake as pureStake,
  requestWithdraw as pureRequestWithdraw,
  withdraw as pureWithdraw,
  reconcileStake as pureReconcileStake,
  withdrawFees as pureWithdrawFees,
  type StakingAccounts,
  type WithdrawFeesAccounts,
} from "./methods/staking.js";
import {
  settleRound as pureSettleRound,
  cancelDispute as pureCancelDispute,
  type CancelDisputeAccounts,
  type SettleRoundAccounts,
} from "./methods/settlement.js";
import {
  awaitCommittedVrf as pureAwaitCommittedVrf,
  drawSeat as pureDrawSeat,
  requestVrf as pureRequestVrf,
  type SeatMembership,
  type RequestVrfExtras,
  type VrfDrawAccounts,
} from "./methods/vrf.js";
import {
  commit as pureCommit,
  finalizeDispute as pureFinalizeDispute,
  finalizeRound as pureFinalizeRound,
  reveal as pureReveal,
  type VoteArgs,
  type VotingAccounts,
} from "./methods/voting.js";
import {
  appeal as pureAppeal,
  claimAppealRefund as pureClaimAppealRefund,
  type AppealAccounts,
  type ClaimRefundAccounts,
} from "./methods/appeal.js";

import type { AccordAdapter } from "./adapter.js";
import { ACCORD_PROGRAM_ID } from "./pda.js";

/** Bound method groups returned by `accord.methods`. */
export interface AccordMethods {
  // dispute (Arbitrable CPI API)
  createDispute(
    accounts: CreateDisputeAccounts,
    args: CreateDisputeArgs,
  ): Promise<{ instruction: Instruction; dispute: Address; bump: number }>;
  getRuling(dispute: Address): Promise<number | null>;

  // lifecycle
  createSubaccord(
    creator: Address,
    args: CreateSubaccordArgs,
  ): Promise<{ instruction: Instruction; subaccord: Address; bump: number }>;
  proposeSubaccordUpdate(
    authority: Address,
    subaccord: Address,
    nonce: bigint,
    payload: UpdatePayload,
  ): Promise<{ instruction: Instruction; pendingUpdate: Address }>;
  getUpdateExecuteAfterSlot(pendingUpdate: Address): Promise<bigint | null>;
  executeSubaccordUpdate(
    caller: Address,
    subaccord: Address,
    pendingUpdate: Address,
  ): Instruction;
  initializePause(
    authority: Address,
  ): Promise<{ instruction: Instruction; pauseState: Address }>;
  pause(authority: Address, pauseState: Address): Instruction;
  proposeUnpause(authority: Address, pauseState: Address): Instruction;
  executeUnpause(caller: Address, pauseState: Address): Instruction;

  // staking (ADR-0012: path-verified accumulator update)
  stake(
    accounts: StakingAccounts,
    amount: bigint,
    path: MSTNode[],
  ): Instruction;
  requestWithdraw(
    accounts: StakingAccounts,
    amount: bigint,
    path: MSTNode[],
  ): Instruction;
  withdraw(accounts: StakingAccounts): Instruction;
  reconcileStake(accounts: StakingAccounts, path: MSTNode[]): Instruction;
  withdrawFees(accounts: WithdrawFeesAccounts): Instruction;

  // settlement (per-round crank + dispute cancellation)
  settleRound(
    accounts: SettleRoundAccounts,
    roundIdx: number,
    remainingAccounts: Address[],
  ): Instruction;
  cancelDispute(
    accounts: CancelDisputeAccounts,
    remainingAccounts: Address[],
  ): Instruction;

  // vrf + per-seat draw (ADR-0009/0012)
  requestVrf(accounts: VrfDrawAccounts, extras: RequestVrfExtras): Instruction;
  awaitCommittedVrf(
    dispute: Address,
    opts?: { pollIntervalMs?: number; timeoutMs?: number },
  ): Promise<Uint8Array>;
  drawSeat(
    accounts: VrfDrawAccounts,
    roundPda: Address,
    seat: number,
    membership: SeatMembership,
  ): Instruction;

  // voting
  commit(
    accounts: VotingAccounts,
    args: VoteArgs,
  ): Promise<{ instruction: Instruction; commitment: Uint8Array }>;
  reveal(accounts: VotingAccounts, args: VoteArgs): Instruction;
  finalizeRound(accounts: VotingAccounts): Instruction;
  finalizeDispute(
    accounts: VotingAccounts,
    remainingAccounts: Address[],
  ): Instruction;

  // appeal
  appeal(accounts: AppealAccounts): Instruction;
  claimAppealRefund(
    accounts: ClaimRefundAccounts,
    roundIdx: number,
  ): Instruction;
}

/**
 * Build the bound method namespace. `signer` is accepted so future per-call
 * signer overrides can route through the facade; today the adapter uses the
 * facade's wallet.
 */
export function createAccordMethods(
  adapter: AccordAdapter,
  programId: Address = ACCORD_PROGRAM_ID,
  // ponytail: reserved for per-call signer routing; the adapter currently uses
  // the facade wallet. Kept on the signature so the public type is stable.
  _signer?: TransactionSigner,
): AccordMethods {
  return {
    // dispute
    createDispute: (accounts, args) =>
      pureCreateDispute(adapter, accounts, args, programId),
    getRuling: (dispute) => pureGetRuling(adapter, dispute),

    // lifecycle
    createSubaccord: (creator, args) =>
      pureCreateSubaccord(adapter, programId, creator, args),
    proposeSubaccordUpdate: (authority, subaccord, nonce, payload) =>
      pureProposeSubaccordUpdate(
        adapter,
        programId,
        authority,
        subaccord,
        nonce,
        payload,
      ),
    getUpdateExecuteAfterSlot: (pendingUpdate) =>
      pureGetUpdateExecuteAfterSlot(adapter, pendingUpdate),
    executeSubaccordUpdate: (caller, subaccord, pendingUpdate) =>
      pureExecuteSubaccordUpdate(
        adapter,
        programId,
        caller,
        subaccord,
        pendingUpdate,
      ),
    initializePause: (authority) =>
      pureInitializePause(adapter, programId, authority),
    pause: (authority, pauseState) =>
      purePause(adapter, programId, authority, pauseState),
    proposeUnpause: (authority, pauseState) =>
      pureProposeUnpause(adapter, programId, authority, pauseState),
    executeUnpause: (caller, pauseState) =>
      pureExecuteUnpause(adapter, programId, caller, pauseState),

    // staking
    stake: (accounts, amount, path) =>
      pureStake(adapter, programId, accounts, amount, path),
    requestWithdraw: (accounts, amount, path) =>
      pureRequestWithdraw(adapter, programId, accounts, amount, path),
    withdraw: (accounts) => pureWithdraw(adapter, programId, accounts),
    reconcileStake: (accounts, path) =>
      pureReconcileStake(adapter, programId, accounts, path),
    withdrawFees: (accounts) => pureWithdrawFees(adapter, programId, accounts),

    // settlement
    settleRound: (accounts, roundIdx, remainingAccounts) =>
      pureSettleRound(
        adapter,
        programId,
        accounts,
        roundIdx,
        remainingAccounts,
      ),
    cancelDispute: (accounts, remainingAccounts) =>
      pureCancelDispute(adapter, programId, accounts, remainingAccounts),

    // vrf + per-seat draw
    requestVrf: (accounts, extras) =>
      pureRequestVrf(adapter, programId, accounts, extras),
    awaitCommittedVrf: (dispute, opts) =>
      pureAwaitCommittedVrf(adapter, dispute, opts),
    drawSeat: (accounts, roundPda, seat, membership) =>
      pureDrawSeat(adapter, programId, accounts, roundPda, seat, membership),

    // voting
    commit: (accounts, args) => pureCommit(adapter, programId, accounts, args),
    reveal: (accounts, args) => pureReveal(adapter, programId, accounts, args),
    finalizeRound: (accounts) =>
      pureFinalizeRound(adapter, programId, accounts),
    finalizeDispute: (accounts, remainingAccounts) =>
      pureFinalizeDispute(adapter, programId, accounts, remainingAccounts),

    // appeal
    appeal: (accounts) => pureAppeal(adapter, programId, accounts),
    claimAppealRefund: (accounts, roundIdx) =>
      pureClaimAppealRefund(adapter, programId, accounts, roundIdx),
  };
}
