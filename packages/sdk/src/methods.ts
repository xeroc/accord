/**
 * Bound orchestration namespace — the eight Accord method groups, pre-bound to
 * a concrete {@link AccordAdapter} + the canonical program id.
 *
 * Each entry forwards to the pure orchestration function in `src/methods/*.ts`,
 * injecting the adapter as the `client` argument. The pure crypto helpers
 * (`buildMst`, `resolvePanel`, `commitHash`, `appealCost`, …) are NOT bound
 * here — they take no client, so import them directly from `@veridao/sdk`.
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
import {
  stake as pureStake,
  unstake as pureUnstake,
  type JurorStakeView,
  type StakingAccounts,
} from "./methods/staking.js";
import {
  challengeSnapshot as pureChallengeSnapshot,
  finalizeSnapshot as pureFinalizeSnapshot,
  postSnapshot as purePostSnapshot,
  type JurorMembership,
  type MerkleSumTree,
  type SnapshotAccounts,
} from "./methods/snapshot.js";
import {
  awaitCommittedVrf as pureAwaitCommittedVrf,
  draw as pureDraw,
  requestVrf as pureRequestVrf,
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

  // staking
  stake(accounts: StakingAccounts, amount: bigint): Instruction;
  unstake(
    accounts: StakingAccounts,
    amount: bigint,
    stakeView?: JurorStakeView,
  ): Promise<Instruction>;

  // snapshot
  postSnapshot(
    accounts: SnapshotAccounts,
    tree: Pick<MerkleSumTree, "rootHash" | "rootSum">,
  ): Instruction;
  challengeSnapshot(
    accounts: SnapshotAccounts,
    challengerTokenAccount: Address,
    proof: unknown,
  ): Instruction;
  finalizeSnapshot(accounts: SnapshotAccounts): Instruction;

  // vrf + draw
  requestVrf(accounts: VrfDrawAccounts, extras: RequestVrfExtras): Instruction;
  awaitCommittedVrf(
    dispute: Address,
    opts?: { pollIntervalMs?: number; timeoutMs?: number },
  ): Promise<Uint8Array>;
  draw(
    accounts: VrfDrawAccounts,
    roundPda: Address,
    drawAttempt: number,
    memberships: JurorMembership[],
    jurorStakeAccounts: Address[],
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
    stake: (accounts, amount) =>
      pureStake(adapter, programId, accounts, amount),
    unstake: (accounts, amount, stakeView) =>
      pureUnstake(adapter, programId, accounts, amount, stakeView),

    // snapshot
    postSnapshot: (accounts, tree) =>
      purePostSnapshot(adapter, programId, accounts, tree),
    challengeSnapshot: (accounts, challengerTokenAccount, proof) =>
      pureChallengeSnapshot(
        adapter,
        programId,
        accounts,
        challengerTokenAccount,
        proof,
      ),
    finalizeSnapshot: (accounts) =>
      pureFinalizeSnapshot(adapter, programId, accounts),

    // vrf + draw
    requestVrf: (accounts, extras) =>
      pureRequestVrf(adapter, programId, accounts, extras),
    awaitCommittedVrf: (dispute, opts) =>
      pureAwaitCommittedVrf(adapter, dispute, opts),
    draw: (accounts, roundPda, drawAttempt, memberships, jurorStakeAccounts) =>
      pureDraw(
        adapter,
        programId,
        accounts,
        roundPda,
        drawAttempt,
        memberships,
        jurorStakeAccounts,
      ),

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
