/**
 * Instruction facades for Canon — typed builders over the generated Codama
 * Kit instruction builders. Each facade takes explicit accounts + args,
 * derives any needed PDAs, and returns an unsigned `Instruction` for the
 * caller to sign + send.
 * The seven v1 instructions:
 *   createList · submitItem · advancePending · challengeItem · settleItem ·
 *   requestWithdrawal · advanceWithdrawal
 *
 * `challenge_item` takes four Accord CPI-only accounts via `remainingAccounts`
 * (the on-chain handler reads them from `ctx.remaining_accounts[0..3]`).
 *
 * @see ADR-0010
 */

import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

import { getCreateListInstruction } from "./generated/instructions/createList.js";
import { getSubmitItemInstruction } from "./generated/instructions/submitItem.js";
import { getAdvancePendingInstruction } from "./generated/instructions/advancePending.js";
import { getChallengeItemInstruction } from "./generated/instructions/challengeItem.js";
import { getSettleItemInstruction } from "./generated/instructions/settleItem.js";
import { getRequestWithdrawalInstruction } from "./generated/instructions/requestWithdrawal.js";
import { getAdvanceWithdrawalInstruction } from "./generated/instructions/advanceWithdrawal.js";

import {
  CANON_PROGRAM_ID,
  findCanonItemPda,
  findCanonListPda,
  findBackingSubaccordPda,
  ACCORD_PROGRAM_ID,
} from "./pda.js";

// ─── create_list ────────────────────────────────────────────────────────────

export interface CreateListAccounts {
  /** Permissionless creator; becomes the Subaccord creator + CanonList.authority. */
  creator: TransactionSigner;
  /** SPL mint for juror collateral (staking_token of the backing Subaccord). */
  stakeMint: Address;
  /** SPL mint for Canon registry economics + Accord fee (fee_token). May equal stakeMint. */
  feeMint: Address;
}

export interface CreateListArgs {
  /** The program whose accounts this list curates; `Pubkey::default()` ⇒ ownership check off. */
  listProgram: Address;
  /** Public listing criteria hash (immutable); becomes the Subaccord `risk_type`. */
  rulesHash: Uint8Array;
  /** Base skin-in-the-game locked at submit (fee_mint). */
  submitDeposit: bigint;
  /** Challenger stakes this fraction (bps) of accumulated_stake. */
  challengePct: number;
  listingWindow: bigint;
  withdrawalTimelock: bigint;
}

/** Build `create_list`: derives the CanonList + backing Subaccord PDAs and CPIs
 * Accord `create_subaccord` (1:1 backing court, canon canonical defaults). */
export async function createList(
  accounts: CreateListAccounts,
  args: CreateListArgs,
  programId: Address = CANON_PROGRAM_ID,
): Promise<{ instruction: Instruction; list: Address; subaccord: Address }> {
  const [list] = await findCanonListPda(
    { creator: accounts.creator.address, rulesHash: args.rulesHash },
    { programAddress: programId },
  );
  const [subaccord] = await findBackingSubaccordPda({
    creator: accounts.creator.address,
    rulesHash: args.rulesHash,
  });
  const instruction = getCreateListInstruction(
    {
      stakeMintAcc: accounts.stakeMint,
      feeMintAcc: accounts.feeMint,
      creator: accounts.creator,
      list,
      subaccord,
      accordProgram: ACCORD_PROGRAM_ID,
      systemProgram: "11111111111111111111111111111111" as Address,
      stakeMint: accounts.stakeMint,
      feeMint: accounts.feeMint,
      listProgram: args.listProgram,
      rulesHash: args.rulesHash,
      submitDeposit: args.submitDeposit,
      challengePct: args.challengePct,
      listingWindow: args.listingWindow,
      withdrawalTimelock: args.withdrawalTimelock,
    },
    { programAddress: programId },
  );
  return { instruction, list, subaccord };
}

// ─── submit_item ────────────────────────────────────────────────────────────

export interface SubmitItemAccounts {
  /** Permissionless submitter; pays for the item account + the deposit. */
  submitter: TransactionSigner;
  /** The CanonList PDA (`["canon", creator, rules_hash]`). */
  list: Address;
  /** The curated account — a PDA owned by `CanonList.list_program`. */
  account: Address;
  feeMint: Address;
  /** Submitter's ATA of `feeMint` (deposit source). */
  submitterTokenAccount: Address;
  /** CanonList-PDA-owned vault ATA (deposit sink; lazily created). */
  vault: Address;
}

export async function submitItem(
  accounts: SubmitItemAccounts,
  args: { evidence: Uint8Array; deposit: bigint },
  programId: Address = CANON_PROGRAM_ID,
): Promise<{ instruction: Instruction; item: Address }> {
  const [item] = await findCanonItemPda(accounts.list, accounts.account, {
    programAddress: programId,
  });
  const instruction = getSubmitItemInstruction(
    {
      submitter: accounts.submitter,
      list: accounts.list,
      item,
      account: accounts.account,
      feeMint: accounts.feeMint,
      submitterTokenAccount: accounts.submitterTokenAccount,
      vault: accounts.vault,
      evidence: args.evidence,
      deposit: args.deposit,
    },
    { programAddress: programId },
  );
  return { instruction, item };
}

// ─── advance_pending ────────────────────────────────────────────────────────

export interface AdvancePendingAccounts {
  /** Permissionless crank caller. */
  caller: TransactionSigner;
  list: Address;
  item: Address;
}

export function advancePending(
  accounts: AdvancePendingAccounts,
  programId: Address = CANON_PROGRAM_ID,
): Instruction {
  return getAdvancePendingInstruction(
    {
      caller: accounts.caller,
      list: accounts.list,
      item: accounts.item,
    },
    { programAddress: programId },
  );
}

// ─── challenge_item ─────────────────────────────────────────────────────────

export interface ChallengeItemAccounts {
  challenger: TransactionSigner;
  list: Address;
  item: Address;
  /** Backing Accord Subaccord (fee_per_juror read from raw bytes). */
  subaccord: Address;
  feeMint: Address;
  /** Challenger's ATA of `feeMint` (stake + fee source). */
  challengerTokenAccount: Address;
  /** CanonList-PDA-owned vault (stake + fee sink; also filer_token_account). */
  vault: Address;
}

/** The four Accord CPI-only accounts, passed via `remaining_accounts`. */
export interface ChallengeItemExtras {
  /** [0] Accord Dispute PDA (mut — Accord inits). */
  accordDispute: Address;
  /** [1] Accord PauseState (readonly). */
  accordPauseState: Address;
  /** [2] Accord Subaccord fee_vault ATA (mut). */
  accordFeeVault: Address;
  /** [3] Accord program id (readonly; address checked on-chain). */
  accordProgram: Address;
}

export function challengeItem(
  accounts: ChallengeItemAccounts,
  args: { evidence: Uint8Array },
  extras: ChallengeItemExtras,
  programId: Address = CANON_PROGRAM_ID,
): Instruction {
  const ix = getChallengeItemInstruction(
    {
      challenger: accounts.challenger,
      list: accounts.list,
      item: accounts.item,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      challengerTokenAccount: accounts.challengerTokenAccount,
      vault: accounts.vault,
      evidence: args.evidence,
    },
    { programAddress: programId },
  );
  // The four Accord CPI-only accounts as remaining_accounts, with the roles
  // Accord's create_dispute expects (the executable accord_program + the
  // read-only pause_state MUST be readonly — marking an executable program
  // writable is rejected as "Invalid program argument").
  const extrasMetas: AccountMeta[] = [
    { address: extras.accordDispute, role: AccountRole.WRITABLE },
    { address: extras.accordPauseState, role: AccountRole.READONLY },
    { address: extras.accordFeeVault, role: AccountRole.WRITABLE },
    { address: extras.accordProgram, role: AccountRole.READONLY },
  ];
  return Object.freeze({
    ...ix,
    accounts: Object.freeze([...(ix.accounts ?? []), ...extrasMetas]),
  }) as Instruction;
}

// ─── settle_item ────────────────────────────────────────────────────────────

export interface SettleItemAccounts {
  /** Permissionless crank caller. */
  caller: TransactionSigner;
  list: Address;
  item: Address;
  /** Accord Dispute PDA — read for `final_ruling`. */
  dispute: Address;
  feeMint: Address;
  /** CanonList-PDA-owned vault (source of bounty / return). */
  vault: Address;
  /** Challenger ATA — receives bounty on `remove`. */
  challengerTokenAccount: Address;
  /** Submitter ATA — receives stake on withdrawal-`keep`. */
  submitterTokenAccount: Address;
}

export function settleItem(
  accounts: SettleItemAccounts,
  programId: Address = CANON_PROGRAM_ID,
): Instruction {
  return getSettleItemInstruction(
    {
      caller: accounts.caller,
      list: accounts.list,
      item: accounts.item,
      dispute: accounts.dispute,
      feeMint: accounts.feeMint,
      vault: accounts.vault,
      challengerTokenAccount: accounts.challengerTokenAccount,
      submitterTokenAccount: accounts.submitterTokenAccount,
    },
    { programAddress: programId },
  );
}

// ─── request_withdrawal ────────────────────────────────────────────────────

export interface RequestWithdrawalAccounts {
  /** Submitter-only; must match `CanonItem.submitter`. */
  submitter: TransactionSigner;
  list: Address;
  item: Address;
}

export function requestWithdrawal(
  accounts: RequestWithdrawalAccounts,
  programId: Address = CANON_PROGRAM_ID,
): Instruction {
  return getRequestWithdrawalInstruction(
    {
      submitter: accounts.submitter,
      list: accounts.list,
      item: accounts.item,
    },
    { programAddress: programId },
  );
}

// ─── advance_withdrawal ────────────────────────────────────────────────────

export interface AdvanceWithdrawalAccounts {
  /** Permissionless crank caller. */
  caller: TransactionSigner;
  list: Address;
  item: Address;
  feeMint: Address;
  /** Submitter's ATA — receives `accumulated_stake`. */
  submitterTokenAccount: Address;
  /** CanonList vault — source of the return. */
  vault: Address;
}

export function advanceWithdrawal(
  accounts: AdvanceWithdrawalAccounts,
  programId: Address = CANON_PROGRAM_ID,
): Instruction {
  return getAdvanceWithdrawalInstruction(
    {
      caller: accounts.caller,
      list: accounts.list,
      item: accounts.item,
      feeMint: accounts.feeMint,
      submitterTokenAccount: accounts.submitterTokenAccount,
      vault: accounts.vault,
    },
    { programAddress: programId },
  );
}
