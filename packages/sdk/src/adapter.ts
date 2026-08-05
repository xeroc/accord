/**
 * Concrete adapter — wires every `Accord*Client` seam (declared by the
 * `src/methods/*.ts` modules) to the Codama-generated Solana Kit client.
 *
 * The method modules stay pure orchestration over typed seams; this module is
 * the single implementor the {@link Accord} facade binds. Each seam method maps
 * 1:1 to a generated `getXxxInstruction` builder (sync, all-explicit accounts)
 * or to a generated account fetcher, so a drift in the IDL surfaces here as a
 * compile error — exactly the ADR-0010 guarantee.
 *
 * Signing model: the facade's loaded wallet (`accord.signer`) is the
 * `TransactionSigner` for every instruction's signing account. The seam's
 * `accounts.signer: Address` documents who signs; the adapter supplies the
 * matching `TransactionSigner` object. Multi-party flows construct one Accord
 * instance per signer.
 *
 * @see ADR-0010
 */

import {
  AccountRole,
  getAddressDecoder,
  getAddressEncoder,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";

import type { Accord } from "./accord.js";

import {
  getCreateDisputeInstruction,
  type CreateDisputeInstructionDataArgs,
} from "./generated/instructions/createDispute.js";
import { getCreateSubaccordInstruction } from "./generated/instructions/createSubaccord.js";
import { getProposeSubaccordUpdateInstruction } from "./generated/instructions/proposeSubaccordUpdate.js";
import { getExecuteSubaccordUpdateInstruction } from "./generated/instructions/executeSubaccordUpdate.js";
import { getInitializePauseInstruction } from "./generated/instructions/initializePause.js";
import { getPauseInstruction } from "./generated/instructions/pause.js";
import { getProposeUnpauseInstruction } from "./generated/instructions/proposeUnpause.js";
import { getExecuteUnpauseInstruction } from "./generated/instructions/executeUnpause.js";
import { getStakeInstruction } from "./generated/instructions/stake.js";
import { getUnstakeInstruction } from "./generated/instructions/unstake.js";
import { getPostSnapshotInstruction } from "./generated/instructions/postSnapshot.js";
import { getChallengeSnapshotInstruction } from "./generated/instructions/challengeSnapshot.js";
import { getFinalizeSnapshotInstruction } from "./generated/instructions/finalizeSnapshot.js";
import { getRequestVrfInstruction } from "./generated/instructions/requestVrf.js";
import { getDrawInstruction } from "./generated/instructions/draw.js";
import { getCommitInstruction } from "./generated/instructions/commit.js";
import { getRevealInstruction } from "./generated/instructions/reveal.js";
import { getFinalizeRoundInstruction } from "./generated/instructions/finalizeRound.js";
import { getFinalizeDisputeInstruction } from "./generated/instructions/finalizeDispute.js";
import { getAppealInstruction } from "./generated/instructions/appeal.js";
import { getClaimAppealRefundInstruction } from "./generated/instructions/claimAppealRefund.js";

import type {
  AccordAppealClient,
  AppealAccounts,
  ClaimRefundAccounts,
} from "./methods/appeal.js";
import type {
  AccordDisputeClient,
  CreateDisputeAccounts,
  CreateDisputeArgs,
  DisputeRulingView,
} from "./methods/dispute.js";
import type {
  AccordLifecycleClient,
  CreateSubaccordArgs,
} from "./methods/lifecycle.js";
import type {
  AccordSnapshotClient,
  SnapshotAccounts,
} from "./methods/snapshot.js";
import type {
  AccordStakingClient,
  JurorStakeView,
  StakingAccounts,
} from "./methods/staking.js";
import type { AccordVotingClient, VotingAccounts } from "./methods/voting.js";
import type { AccordVrfClient, VrfDrawAccounts } from "./methods/vrf.js";

import type { JurorMembership as SdkJurorMembership } from "./methods/snapshot.js";
import type { FraudProofArgs, JurorMembershipArgs } from "./generated/types";

/** Union of every seam the adapter implements. */
export interface AccordAdapter
  extends
    AccordDisputeClient,
    AccordLifecycleClient,
    AccordStakingClient,
    AccordSnapshotClient,
    AccordVrfClient,
    AccordVotingClient,
    AccordAppealClient {}

/**
 * Build the concrete adapter bound to an {@link Accord} facade instance. The
 * returned object satisfies all seven `Accord*Client` seams, so the pure
 * orchestration functions in `src/methods/*.ts` can drive the chain end-to-end.
 */
export function createAccordAdapter(accord: Accord): AccordAdapter {
  return {
    // ── dispute (Arbitrable CPI API) ────────────────────────────────────────
    buildCreateDispute(input) {
      const { accounts, args } = input;
      return getCreateDisputeInstruction(
        {
          filer: accord.signer,
          subaccord: accounts.subaccord,
          pauseState: accounts.pauseState,
          dispute: input.disputePda,
          stakingToken: accounts.stakingToken,
          filerTokenAccount: accounts.filerTokenAccount,
          vault: accounts.vault,
          options: args.options as CreateDisputeInstructionDataArgs["options"],
          evidenceHash: args.evidenceHash,
          nonce: args.nonce,
          fee: args.fee,
        },
        { programAddress: input.programId },
      );
    },
    async fetchDispute(address): Promise<DisputeRulingView | null> {
      const m = await accord.client.accord.accounts.dispute.fetchMaybe(address);
      if (!m.exists) return null;
      const fr = m.data.finalRuling; // u8; u8::MAX (255) sentinel = no ruling yet
      return { finalRuling: fr === 255 ? null : fr };
    },

    // ── lifecycle (Subaccord + circuit breaker) ────────────────────────────
    buildCreateSubaccord(input) {
      return getCreateSubaccordInstruction(
        {
          creator: accord.signer,
          subaccord: input.subaccordPda,
          ...mapCreateSubaccordArgs(input.args),
        },
        { programAddress: input.programId },
      );
    },
    buildProposeSubaccordUpdate(input) {
      return getProposeSubaccordUpdateInstruction(
        {
          authority: accord.signer,
          subaccord: input.subaccord,
          pendingUpdate: input.pendingUpdatePda,
          nonce: input.nonce,
          payload: input.payload,
        },
        { programAddress: input.programId },
      );
    },
    buildExecuteSubaccordUpdate(input) {
      return getExecuteSubaccordUpdateInstruction(
        {
          caller: accord.signer,
          subaccord: input.subaccord,
          pendingUpdate: input.pendingUpdate,
        },
        { programAddress: input.programId },
      );
    },
    buildInitializePause(input) {
      return getInitializePauseInstruction(
        {
          authority: accord.signer,
          pauseState: input.pauseStatePda,
        },
        { programAddress: input.programId },
      );
    },
    buildPause(input) {
      return getPauseInstruction(
        { authority: accord.signer, pauseState: input.pauseState },
        { programAddress: input.programId },
      );
    },
    buildProposeUnpause(input) {
      return getProposeUnpauseInstruction(
        { authority: accord.signer, pauseState: input.pauseState },
        { programAddress: input.programId },
      );
    },
    buildExecuteUnpause(input) {
      return getExecuteUnpauseInstruction(
        { caller: accord.signer, pauseState: input.pauseState },
        { programAddress: input.programId },
      );
    },
    async fetchPendingUpdateExecuteAfter(
      pendingUpdate,
    ): Promise<bigint | null> {
      const m =
        await accord.client.accord.accounts.pendingUpdate.fetchMaybe(
          pendingUpdate,
        );
      if (!m.exists) return null;
      return m.data.executeAfterSlot;
    },

    // ── staking ────────────────────────────────────────────────────────────
    buildStake(input) {
      if (!input.accounts.pauseState) {
        throw new Error(
          "StakePausedStateMissing: stake requires the pauseState PDA",
        );
      }
      return getStakeInstruction(
        {
          juror: accord.signer,
          subaccord: input.accounts.subaccord,
          pauseState: input.accounts.pauseState,
          jurorStake: input.accounts.jurorStake,
          stakingToken: input.accounts.stakingToken,
          jurorTokenAccount: input.accounts.jurorTokenAccount,
          vault: input.accounts.vault,
          amount: input.amount,
        },
        { programAddress: input.programId },
      );
    },
    buildUnstake(input) {
      return getUnstakeInstruction(
        {
          juror: accord.signer,
          subaccord: input.accounts.subaccord,
          jurorStake: input.accounts.jurorStake,
          stakingToken: input.accounts.stakingToken,
          jurorTokenAccount: input.accounts.jurorTokenAccount,
          vault: input.accounts.vault,
          amount: input.amount,
        },
        { programAddress: input.programId },
      );
    },
    async fetchJurorStake(jurorStake): Promise<JurorStakeView | null> {
      const m =
        await accord.client.accord.accounts.jurorStake.fetchMaybe(jurorStake);
      if (!m.exists) return null;
      return {
        juror: m.data.juror,
        amount: m.data.amount,
        activeDraws: m.data.activeDraws,
      };
    },

    // ── snapshot trust ─────────────────────────────────────────────────────
    buildPostSnapshot(input) {
      return getPostSnapshotInstruction(
        {
          poster: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          snapshot: input.accounts.snapshot,
          stakingToken: input.accounts.stakingToken,
          posterTokenAccount: input.accounts.posterTokenAccount,
          vault: input.accounts.vault,
          merkleRoot: input.merkleRoot,
          totalStake: input.totalStake,
        },
        { programAddress: input.programId },
      );
    },
    buildChallengeSnapshot(input) {
      return getChallengeSnapshotInstruction(
        {
          challenger: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          snapshot: input.accounts.snapshot,
          stakingToken: input.accounts.stakingToken,
          challengerTokenAccount: input.challengerTokenAccount,
          posterTokenAccount: input.accounts.posterTokenAccount,
          vault: input.accounts.vault,
          proof: input.proof as FraudProofArgs,
        },
        { programAddress: input.programId },
      );
    },
    buildFinalizeSnapshot(input) {
      return getFinalizeSnapshotInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          snapshot: input.accounts.snapshot,
          stakingToken: input.accounts.stakingToken,
          posterTokenAccount: input.accounts.posterTokenAccount,
          vault: input.accounts.vault,
        },
        { programAddress: input.programId },
      );
    },

    // ── VRF + draw ─────────────────────────────────────────────────────────
    buildRequestVrf(input) {
      return getRequestVrfInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          snapshot: input.accounts.snapshot,
          oracleQueue: input.extras.oracleQueue,
          programIdentity: input.extras.programIdentity,
        },
        { programAddress: input.programId },
      );
    },
    buildDraw(input) {
      const ix = getDrawInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          snapshot: input.accounts.snapshot,
          round: input.roundPda,
          drawAttempt: input.drawAttempt,
          memberships: input.memberships.map(mapMembership),
        },
        { programAddress: input.programId },
      );
      return appendRemaining(ix, input.jurorStakeAccounts);
    },
    async fetchCommittedVrf(dispute): Promise<Uint8Array | null> {
      const m = await accord.client.accord.accounts.dispute.fetchMaybe(dispute);
      if (!m.exists) return null;
      const vrf = m.data.committedVrf;
      return vrf.__option === "Some" ? new Uint8Array(vrf.value) : null;
    },

    // ── voting ─────────────────────────────────────────────────────────────
    buildCommit(input) {
      return getCommitInstruction(
        {
          juror: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          round: input.accounts.round,
          commitment: input.commitment,
        },
        { programAddress: input.programId },
      );
    },
    buildReveal(input) {
      return getRevealInstruction(
        {
          juror: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          round: input.accounts.round,
          vote: input.vote,
          salt: input.salt,
        },
        { programAddress: input.programId },
      );
    },
    buildFinalizeRound(input) {
      return getFinalizeRoundInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          round: input.accounts.round,
        },
        { programAddress: input.programId },
      );
    },
    buildFinalizeDispute(input) {
      const ix = getFinalizeDisputeInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          round: input.accounts.round,
        },
        { programAddress: input.programId },
      );
      return appendRemaining(ix, input.remainingAccounts);
    },
    encodeAddress(address) {
      return new Uint8Array(getAddressEncoder().encode(address));
    },

    // ── appeal ─────────────────────────────────────────────────────────────
    buildAppeal(input) {
      return getAppealInstruction(
        {
          appellant: accord.signer,
          ...mapAppealAccounts(input.accounts),
        },
        { programAddress: input.programId },
      );
    },
    buildClaimAppealRefund(input) {
      return getClaimAppealRefundInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          appealBond: input.accounts.appealBond,
          stakingToken: input.accounts.stakingToken,
          claimantTokenAccount: input.accounts.claimantTokenAccount,
          vault: input.accounts.vault,
          roundIdx: input.roundIdx,
        },
        { programAddress: input.programId },
      );
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** SDK `CreateSubaccordArgs` → generated instruction-data args (1:1). */
function mapCreateSubaccordArgs(
  args: CreateSubaccordArgs,
): Omit<CreateSubaccordArgs, never> {
  return {
    riskType: args.riskType,
    evidenceSpec: args.evidenceSpec,
    stakingToken: args.stakingToken,
    minStake: args.minStake,
    jurorsPerDispute: args.jurorsPerDispute,
    alphaBps: args.alphaBps,
    reviewWindow: args.reviewWindow,
    commitWindow: args.commitWindow,
    revealWindow: args.revealWindow,
    maxAppeals: args.maxAppeals,
    feePerJuror: args.feePerJuror,
    authority: args.authority,
    evidenceOperator: args.evidenceOperator,
  };
}

/** Map seam `AppealAccounts` → generated `appeal` instruction accounts. */
function mapAppealAccounts(a: AppealAccounts) {
  return {
    subaccord: a.subaccord,
    pauseState: a.pauseState,
    dispute: a.dispute,
    round: a.round,
    appealBond: a.appealBond,
    stakingToken: a.stakingToken,
    appellantTokenAccount: a.appellantTokenAccount,
    vault: a.vault,
  };
}

/** SDK MST `JurorMembership` (32-byte juror) → on-chain args (`Address` juror). */
function mapMembership(m: SdkJurorMembership): JurorMembershipArgs {
  return {
    leaf: {
      juror: getAddressDecoder().decode(m.leaf.juror),
      stake: m.leaf.stake,
      cumAfter: m.leaf.cumAfter,
    },
    proof: m.proof.map((p) => ({
      siblingHash: p.siblingHash,
      siblingSum: p.siblingSum,
    })),
    index: m.index,
  };
}

/**
 * Append `remaining_accounts` (JurorStake / AppealBond PDAs) as writable
 * non-signer metas. The on-chain handlers mutate these (slashes, refunds,
 * `active_draws` bumps), so they must be `WRITABLE`.
 */
function appendRemaining(
  ix: Instruction,
  extra: readonly Address[],
): Instruction {
  if (extra.length === 0) return ix;
  const metas: AccountMeta[] = extra.map((address) => ({
    address,
    role: AccountRole.WRITABLE,
  }));
  return Object.freeze({
    ...ix,
    accounts: Object.freeze([...(ix.accounts ?? []), ...metas]),
  }) as Instruction;
}
