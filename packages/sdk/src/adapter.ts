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
 * ADR-0012: the snapshot trio (post/challenge/finalize) and the one-shot `draw`
 * are gone; `stake`/`unstake` thread an accumulator `path`; `draw_seat` fills
 * the panel one seat per tx against `dispute.frozen_root`; `commit_vrf_callback`
 * (invoked by the oracle) freezes the root.
 *
 * Signing model: the facade's loaded wallet (`accord.signer`) is the
 * `TransactionSigner` for every instruction's signing account.
 *
 * @see ADR-0010, ADR-0012
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
import { getRequestVrfInstruction } from "./generated/instructions/requestVrf.js";
import { getDrawSeatInstruction } from "./generated/instructions/drawSeat.js";
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
  AccordStakingClient,
  JurorStakeView,
  StakingAccounts,
} from "./methods/staking.js";
import type { MSTNode } from "./methods/mst.js";
import type { AccordVotingClient, VotingAccounts } from "./methods/voting.js";
import type {
  AccordVrfClient,
  SeatMembership,
  VrfDrawAccounts,
} from "./methods/vrf.js";

/** Union of every seam the adapter implements. */
export interface AccordAdapter
  extends
    AccordDisputeClient,
    AccordLifecycleClient,
    AccordStakingClient,
    AccordVrfClient,
    AccordVotingClient,
    AccordAppealClient {}

/**
 * Build the concrete adapter bound to an {@link Accord} facade instance. The
 * returned object satisfies all six `Accord*Client` seams, so the pure
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

    // ── staking (ADR-0012: path-verified accumulator update) ───────────────
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
          path: mapPath(input.path),
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
          path: mapPath(input.path),
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

    // ── VRF + per-seat draw (ADR-0009/0012) ────────────────────────────────
    buildRequestVrf(input) {
      return getRequestVrfInstruction(
        {
          caller: accord.signer,
          subaccord: input.accounts.subaccord,
          dispute: input.accounts.dispute,
          oracleQueue: input.extras.oracleQueue,
          programIdentity: input.extras.programIdentity,
        },
        { programAddress: input.programId },
      );
    },
    buildDrawSeat(input) {
      const ix = getDrawSeatInstruction(
        {
          caller: accord.signer,
          dispute: input.accounts.dispute,
          round: input.roundPda,
          seat: input.seat,
          leaf: mapLeaf(input.leaf),
          proof: mapPath(input.proof),
          index: input.index,
        },
        { programAddress: input.programId },
      );
      // remaining_accounts[0] = the drawn juror's JurorStake PDA (writable).
      return appendRemaining(ix, [input.jurorStake]);
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
      const a = input.accounts;
      if (!a.stakingToken || !a.jurorTokenAccount || !a.vault) {
        throw new Error(
          "InvalidRevealAccounts: reveal requires stakingToken, jurorTokenAccount, vault",
        );
      }
      return getRevealInstruction(
        {
          juror: accord.signer,
          subaccord: a.subaccord,
          dispute: a.dispute,
          round: a.round,
          stakingToken: a.stakingToken,
          jurorTokenAccount: a.jurorTokenAccount,
          vault: a.vault,
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

/** SDK `CreateSubaccordArgs` → generated instruction-data args (1:1, +depth). */
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
    depth: args.depth,
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

/**
 * SDK MST `MSTNode` (byte-oriented) → generated args. `siblingHash` is a
 * `[u8;32]`; `siblingSum` is a u64. Shapes line up 1:1 — this wrapper keeps the
 * import boundary explicit.
 */
function mapPath(
  path: MSTNode[],
): { siblingHash: Uint8Array; siblingSum: number | bigint }[] {
  return path.map((p) => ({
    siblingHash: p.siblingHash,
    siblingSum: p.siblingSum,
  }));
}

/** SDK `LeafClaim` (byte-oriented juror) → generated args (`Address` juror). */
function mapLeaf(leaf: { juror: Uint8Array; stake: bigint }): {
  juror: Address;
  stake: number | bigint;
} {
  return {
    juror: getAddressDecoder().decode(leaf.juror),
    stake: leaf.stake,
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

// silence the unused-import lint for `VotingAccounts`/`VrfDrawAccounts`/etc.
// which are referenced only in the seam composition above.
export type { SeatMembership, VrfDrawAccounts, VotingAccounts };
