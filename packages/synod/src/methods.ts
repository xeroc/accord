/**
 * Instruction facades for Synod — typed builders over the generated Codama
 * Kit instruction builders. Each facade takes explicit accounts + args,
 * derives any needed PDAs/ATAs, and returns an unsigned `Instruction` for the
 * caller to sign + send.
 * The five v1 instructions:
 *   openCase · join · fileDispute · refundRosterMiss · claim
 *
 * Derived addresses (canonical, constraint-pinned on-chain):
 *   - SynodCase PDA `["case", opener, nonce]` (`openCase`)
 *   - case vault ATA of `feeMint` owned by the case PDA (every token flow)
 *   - the joining party's ATA of `feeMint` (`join`; `associated_token`
 *     constraint pins it, so the canonical ATA is the only valid source)
 * Explicit addresses (non-canonical or caller-owned): `refundRosterMiss` /
 * `claim` destinations (any token account the party owns) and the four Accord
 * CPI-only accounts `fileDispute` passes via `remainingAccounts`.
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
import { findAssociatedTokenAddress } from "@useaccord/sdk";

import { getOpenCaseInstruction } from "./generated/instructions/openCase.js";
import { getJoinInstruction } from "./generated/instructions/join.js";
import { getFileDisputeInstruction } from "./generated/instructions/fileDispute.js";
import { getRefundRosterMissInstruction } from "./generated/instructions/refundRosterMiss.js";
import { getClaimInstruction } from "./generated/instructions/claim.js";
import { SYNOD_PROGRAM_ID, findCaseVaultPda, findSynodCasePda } from "./pda.js";

// ─── open_case ───────────────────────────────────────────────────────────────

export interface OpenCaseAccounts {
  /** Permissionless opener; names itself at roster index 0 (joins like anyone). */
  opener: TransactionSigner;
  /** The hosting Accord court — read once for aggregation + the frozen fee. */
  subaccord: Address;
}

export interface OpenCaseArgs {
  /** Roster in naming order, opener first: 2..=7 distinct parties. */
  parties: Address[];
  /** Per-party stake `S` (`subaccord.fee_token`); the only economic dial. */
  stake: number | bigint;
  /** Unix timestamp after which an incomplete roster refunds. */
  joinDeadline: number | bigint;
  /** Case PDA seed disambiguator. */
  nonce: number | bigint;
}

/** Build `open_case`: derives the SynodCase PDA `["case", opener, nonce]`
 * and inits it in `Opening` with the fee frozen from the Subaccord. */
export async function openCase(
  accounts: OpenCaseAccounts,
  args: OpenCaseArgs,
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<{ instruction: Instruction; case: Address }> {
  const [casePda] = await findSynodCasePda(
    { opener: accounts.opener.address, nonce: args.nonce },
    { programAddress: programId },
  );
  const instruction = getOpenCaseInstruction(
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

// ─── join ────────────────────────────────────────────────────────────────────

export interface JoinAccounts {
  /** A named party (`signer == parties[i]`, unjoined slot). */
  party: TransactionSigner;
  /** The SynodCase PDA. */
  case: Address;
  /** Hosting court, linked to the case (read for `fee_token`). */
  subaccord: Address;
  /** The Subaccord `fee_token` — the single escrow mint (ADR-0020). */
  feeMint: Address;
}

/** Build `join`: derives the party ATA (stake source) and the case vault ATA
 * (stake sink; lazily created on first join). */
export async function join(
  accounts: JoinAccounts,
  args: { evidenceHash: Uint8Array },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<{
  instruction: Instruction;
  partyTokenAccount: Address;
  vault: Address;
}> {
  const [partyTokenAccount, vault] = await Promise.all([
    findAssociatedTokenAddress(accounts.feeMint, accounts.party.address),
    findCaseVaultPda(accounts.feeMint, accounts.case),
  ]);
  const instruction = getJoinInstruction(
    {
      party: accounts.party,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount,
      vault,
      evidenceHash: args.evidenceHash,
    },
    { programAddress: programId },
  );
  return { instruction, partyTokenAccount, vault };
}

// ─── file_dispute ────────────────────────────────────────────────────────────

export interface FileDisputeAccounts {
  /** Anyone (permissionless crank-style caller; pays nothing). */
  caller: TransactionSigner;
  /** Case opener — seed component, re-validated by the `case` seeds check. */
  opener: Address;
  /** The SynodCase PDA. */
  case: Address;
  /** Hosting court, linked to the case. */
  subaccord: Address;
  /** The Subaccord `fee_token`. */
  feeMint: Address;
}

/** The four Accord CPI-only accounts, passed via `remaining_accounts`. */
export interface FileDisputeExtras {
  /** [0] Accord Dispute PDA `["dispute", case, 0]` (mut — Accord inits). */
  accordDispute: Address;
  /** [1] Accord AccordState (readonly — must be unpaused). */
  accordState: Address;
  /** [2] Accord Subaccord fee_vault ATA (mut). */
  accordFeeVault: Address;
  /** [3] Accord program id (readonly; address checked on-chain). */
  accordProgram: Address;
}

/** Build `file_dispute`: derives the case vault ATA (the Accord CPI
 * `filer_token_account` — the frozen fee flows vault → Subaccord fee_vault)
 * and appends the four Accord CPI-only accounts as remaining accounts. */
export async function fileDispute(
  accounts: FileDisputeAccounts,
  args: { nonce: number | bigint },
  extras: FileDisputeExtras,
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  const vault = await findCaseVaultPda(accounts.feeMint, accounts.case);
  const ix = getFileDisputeInstruction(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
  // The four Accord CPI-only accounts as remaining_accounts, with the roles
  // Accord's create_dispute expects (the executable accord_program + the
  // read-only accord_state MUST be readonly — marking an executable program
  // writable is rejected as "Invalid program argument"). Order matches
  // file_dispute.rs remaining_accounts[0..3] — same as canon challenge_item.
  const extrasMetas: AccountMeta[] = [
    { address: extras.accordDispute, role: AccountRole.WRITABLE },
    { address: extras.accordState, role: AccountRole.READONLY },
    { address: extras.accordFeeVault, role: AccountRole.WRITABLE },
    { address: extras.accordProgram, role: AccountRole.READONLY },
  ];
  return Object.freeze({
    ...ix,
    accounts: Object.freeze([...(ix.accounts ?? []), ...extrasMetas]),
  }) as Instruction;
}

// ─── refund_roster_miss ──────────────────────────────────────────────────────

export interface RefundRosterMissAccounts {
  /** Anyone (permissionless crank). */
  caller: TransactionSigner;
  /** Case opener — seed component, re-validated by the `case` seeds check. */
  opener: Address;
  /** The SynodCase PDA. */
  case: Address;
  /** Hosting court, linked to the case. */
  subaccord: Address;
  /** The Subaccord `fee_token`. */
  feeMint: Address;
  /** Destination: the joined party's `feeMint` token account (ATA by
   * convention; any token account the party owns — the owner identifies the
   * party). */
  partyTokenAccount: Address;
}

/** Build `refund_roster_miss`: derives the case vault ATA; one joined
 * party's `S` back per call (pull-only, idempotent via `paid_out` bits). */
export async function refundRosterMiss(
  accounts: RefundRosterMissAccounts,
  args: { nonce: number | bigint },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  const vault = await findCaseVaultPda(accounts.feeMint, accounts.case);
  return getRefundRosterMissInstruction(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount: accounts.partyTokenAccount,
      vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
}

// ─── claim ───────────────────────────────────────────────────────────────────

export interface ClaimAccounts {
  /** Anyone (permissionless crank). */
  caller: TransactionSigner;
  /** Case opener — seed component, re-validated by the `case` seeds check. */
  opener: Address;
  /** The SynodCase PDA. */
  case: Address;
  /** The bound Accord dispute (immutable after `file_dispute`). */
  dispute: Address;
  /** Hosting court, linked to the case. */
  subaccord: Address;
  /** The Subaccord `fee_token`. */
  feeMint: Address;
  /** Destination: the claiming party's `feeMint` token account (ATA by
   * convention; any token account the party owns — the owner identifies the
   * party). */
  partyTokenAccount: Address;
}

/** Build `claim`: derives the case vault ATA; one party's due share per call
 * (winner pot / neutral split / full `S` on Failed — pull-only, idempotent). */
export async function claim(
  accounts: ClaimAccounts,
  args: { nonce: number | bigint },
  programId: Address = SYNOD_PROGRAM_ID,
): Promise<Instruction> {
  const vault = await findCaseVaultPda(accounts.feeMint, accounts.case);
  return getClaimInstruction(
    {
      caller: accounts.caller,
      opener: accounts.opener,
      case: accounts.case,
      dispute: accounts.dispute,
      subaccord: accounts.subaccord,
      feeMint: accounts.feeMint,
      partyTokenAccount: accounts.partyTokenAccount,
      vault,
      nonce: args.nonce,
    },
    { programAddress: programId },
  );
}
