/**
 * Instruction facades for Synod — typed builders over the generated Codama
 * instruction builders (ADR-0010 two-layer pattern, mirrors @useaccord/canon).
 *
 * Every facade resolves PDAs from `./pda.js` (single source) and returns a
 * plain Kit `Instruction` for `sendAndConfirmTransactionFactory` pipelines —
 * no `ClientWithRpc` needed. Signers stay in the caller's hands: `openCase`
 * signs with the opener, `join` with the joining party; the three crank-style
 * calls (`fileDispute`, `refundRosterMiss`, `claim`) sign with any payer.
 */

import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

import { getOpenCaseInstructionAsync } from "./generated/instructions/openCase.js";
import { getJoinInstructionAsync } from "./generated/instructions/join.js";
import { getFileDisputeInstructionAsync } from "./generated/instructions/fileDispute.js";
import { getRefundRosterMissInstructionAsync } from "./generated/instructions/refundRosterMiss.js";
import { getClaimInstructionAsync } from "./generated/instructions/claim.js";

import {
  ACCORD_PROGRAM_ID,
  SYNOD_PROGRAM_ID,
  findCasePda,
} from "./pda.js";

// ─── open_case ──────────────────────────────────────────────────────────────

export interface OpenCaseAccounts {
  /** Case opener — becomes `parties[0]`; signs + pays the case PDA rent. */
  opener: TransactionSigner;
  /** The hosting Accord court (fee source snapshot: min_jury_size · fee_per_juror frozen at open). */
  subaccord: Address;
}

export interface OpenCaseArgs {
  /** Party roster in naming order, `2..=7` distinct pubkeys; `parties[0]` MUST be the opener. */
  parties: Address[];
  /** Per-party stake `S` (fee_token). */
  stake: bigint;
  /** Unix timestamp after which an incomplete roster refunds. */
  joinDeadline: bigint;
  /** Case seed component — unique per (opener, nonce). */
  nonce: number | bigint;
}

/** Build `open_case`: derives the SynodCase PDA and freezes the fee. */
export async function openCase(
  accounts: OpenCaseAccounts,
  args: OpenCaseArgs,
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<{ instruction: Instruction; case: Address }> {
  const [casePda] = await findCasePda(
    { opener: accounts.opener.address, nonce: args.nonce },
    { programAddress: programId },
  );
  const instruction = await getOpenCaseInstructionAsync(
    {
      opener: accounts.opener,
      subaccord: accounts.subaccord,
      case: casePda,
      parties: args.parties,
      stake: args.stake,
      joinDeadline: args.joinDeadline,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
  return { instruction, case: casePda };
}

// ─── join ───────────────────────────────────────────────────────────────────

export interface JoinAccounts {
  /** A named party on the case (signer == parties[i]); pays the vault-ATA rent on first join. */
  party: TransactionSigner;
  /** The SynodCase PDA (`["case", opener, nonce]`). */
  case: Address;
  /** The hosting court (linked to the case); read for `fee_token`. */
  subaccord: Address;
  feeMint: Address;
  /** The party's ATA of `feeMint` (stake source). */
  partyTokenAccount: Address;
  /** Case-PDA-owned vault ATA (stake sink; lazily created). */
  vault: Address;
}

/** Build `join`: locks `S` party ATA → vault, freezes the evidence hash slot. */
export async function join(
  accounts: JoinAccounts,
  args: { evidenceHash: Uint8Array },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  return await getJoinInstructionAsync(
    {
      party: accounts.party,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount: accounts.partyTokenAccount,
      vault: accounts.vault,
      evidenceHash: args.evidenceHash,
    },
    { programAddress: programId },
  );
}

// ─── file_dispute ───────────────────────────────────────────────────────────

/** The four Accord CPI-only accounts, passed via `remaining_accounts`. */
export interface FileDisputeExtras {
  /** [0] Accord Dispute PDA (mut — Accord inits). */
  accordDispute: Address;
  /** [1] Accord AccordState (readonly). */
  accordState: Address;
  /** [2] Accord Subaccord fee_vault ATA (mut). */
  accordFeeVault: Address;
}

export interface FileDisputeAccounts {
  /** Permissionless caller; pays nothing. */
  caller: TransactionSigner;
  /** Case opener — seed component of the case PDA. */
  opener: Address;
  /** The SynodCase PDA. */
  case: Address;
  subaccord: Address;
  feeMint: Address;
  /** Case-PDA-owned vault; doubles as the Accord CPI `filer_token_account`. */
  vault: Address;
}

/** Build `file_dispute`: full-roster gate, CPI Accord `create_dispute` as the
 * case PDA (vault pays the frozen fee), bind `["dispute", case, 0]`, go Live. */
export async function fileDispute(
  accounts: FileDisputeAccounts,
  args: { nonce: number | bigint },
  extras: FileDisputeExtras,
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  const ix = await getFileDisputeInstructionAsync(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      vault: accounts.vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
  // The four Accord CPI-only accounts as remaining_accounts, with the roles
  // Accord's create_dispute expects (executable accord_program + read-only
  // accord_state MUST be readonly — mirroring canon challengeItem).
  const extrasMetas: AccountMeta[] = [
    { address: extras.accordDispute, role: AccountRole.WRITABLE },
    { address: extras.accordState, role: AccountRole.READONLY },
    { address: extras.accordFeeVault, role: AccountRole.WRITABLE },
    { address: ACCORD_PROGRAM_ID, role: AccountRole.READONLY },
  ];
  return Object.freeze({
    ...ix,
    accounts: Object.freeze([...(ix.accounts ?? []), ...extrasMetas]),
  }) as Instruction;
}

// ─── refund_roster_miss ─────────────────────────────────────────────────────

export interface RefundRosterMissAccounts {
  /** Permissionless caller. */
  caller: TransactionSigner;
  /** Case opener — seed component of the case PDA. */
  opener: Address;
  case: Address;
  subaccord: Address;
  feeMint: Address;
  /** The joined party's `fee_token` account — its owner identifies the party. */
  partyTokenAccount: Address;
  vault: Address;
}

/** Build `refund_roster_miss`: one joined party's `S` back (idempotent per
 * `paid_out` bit); closes the case when every joined bit is paid. */
export async function refundRosterMiss(
  accounts: RefundRosterMissAccounts,
  args: { nonce: number | bigint },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  return await getRefundRosterMissInstructionAsync(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount: accounts.partyTokenAccount,
      vault: accounts.vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
}

// ─── claim ──────────────────────────────────────────────────────────────────

export interface ClaimAccounts {
  /** Permissionless caller. */
  caller: TransactionSigner;
  /** Case opener — seed component of the case PDA. */
  opener: Address;
  case: Address;
  /** The bound Accord dispute (must equal `case.dispute`). */
  dispute: Address;
  subaccord: Address;
  feeMint: Address;
  /** The claiming party's `fee_token` account — its owner identifies the party. */
  partyTokenAccount: Address;
  vault: Address;
}

/** Build `claim`: one party's due share (winner pot / neutral floor share with
 * last-claimant remainder / full `S` on Failed); idempotent per `paid_out` bit. */
export async function claim(
  accounts: ClaimAccounts,
  args: { nonce: number | bigint },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  return await getClaimInstructionAsync(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      dispute: accounts.dispute,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount: accounts.partyTokenAccount,
      vault: accounts.vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
}
