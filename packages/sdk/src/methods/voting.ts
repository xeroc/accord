/**
 * voting.ts — commit-reveal voting + finalization cranks (ADR-0010).
 *
 * The load-bearing client-side cryptography lives here: the commit hash
 *   `sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])`
 * which the on-chain `reveal` recomputes via `solana_program::hash::hashv`
 * (lib.rs:1109-1111) and checks against the stored commitment. Mismatching the
 * byte order or lengths here silently breaks every dispute, so `commitHash` is
 * unit-tested against a hardcoded digest vector.
 *
 * Four instructions are orchestrated:
 *   - {@link commit}         juror commits `hash(vote, salt, juror)`.
 *   - {@link reveal}         juror reveals `{vote, salt}` (chain re-derives hash).
 *   - {@link finalizeRound}  permissionless crank: plurality tally → RoundResolved.
 *   - {@link finalizeDispute} permissionless crank: settles economics, writes ruling.
 *
 * As in dispute.ts, the module is pure facade orchestration over a typed
 * {@link AccordVotingClient} seam that Foundation wires to the Codama-generated
 * Kit client. Kit is imported type-only (erased at runtime); the PDA helper
 * lazy-imports Kit so the unit tests load zero runtime deps.
 *
 * Sources of truth:
 *   - commit/reveal/finalize_*: programs/accord/src/lib.rs (lines 1041-1530)
 *   - Round struct + seeds:     programs/accord/src/state.rs (Round, SEED_ROUND)
 */
import type { Address, Instruction } from "@solana/kit";

/** Dispute-state sentinel Round uses for "not revealed" (state.rs: u8::MAX). */
export const NO_VOTE = 0xff;

/** Round PDA seed prefix, `b"round"` (state.rs: SEED_ROUND). */
const SEED_ROUND = new Uint8Array([114, 111, 117, 110, 100]); // "round"

/** Commit-hash preimage length: 1 vote byte + 32 salt + 32 juror pubkey. */
const COMMIT_PREIMAGE_LEN = 1 + 32 + 32;

/**
 * Shared accounts every voting instruction takes (juror or cranker signs).
 *
 * `commit`/`reveal`/`finalizeRound`/`finalizeDispute` use only the first four.
 * The `stakingToken`/`jurorTokenAccount`/`vault` fields are vestigial: pre
 * ADR-0020 `reveal` paid a fee on reveal; that credit now happens in
 * `finalize_round`. The adapter ignores them and the chain doesn't ask.
 * `tokenProgram` is a fixed constant.
 */
export interface VotingAccounts {
  /** Commit/reveal: the drawn juror. finalize_*: any cranker. Always a signer. */
  signer: Address;
  subaccord: Address;
  dispute: Address;
  round: Address;
  /** @deprecated vestigial — reveal no longer moves tokens (ADR-0020). */
  stakingToken?: Address;
  /** @deprecated vestigial — reveal no longer moves tokens (ADR-0020). */
  jurorTokenAccount?: Address;
  /** @deprecated vestigial — reveal no longer moves tokens (ADR-0020). */
  vault?: Address;
}

/** A juror's vote + salt (the reveal preimage). */
export interface VoteArgs {
  /** Option index, `0..num_options` (lib.rs:1092: `vote < num_options`). */
  vote: number;
  /** 32-byte random salt — secret until reveal. */
  salt: Uint8Array;
}

/**
 * Compute the commit hash `sha256(vote_byte ‖ salt[32] ‖ juror_pubkey[32])`.
 *
 * Bit-for-bit compatible with the on-chain `reveal` check (lib.rs:1109-1110):
 *   `hashv(&[&[vote], &salt, juror_key.as_ref()]).to_bytes()`.
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle`): zero-dependency,
 * available in Node ≥ 18 and all browsers. `jurorBytes` is the juror's 32-byte
 * pubkey encoding (Kit's `getAddressEncoder().encode(juror)`).
 */
export async function commitHash(
  vote: number,
  salt: Uint8Array,
  jurorBytes: Uint8Array,
): Promise<Uint8Array> {
  if (vote < 0 || vote > 0xff) {
    throw new Error(`InvalidVote: vote must fit a u8, got ${vote}`);
  }
  if (salt.length !== 32) {
    throw new Error(`InvalidSalt: expected 32 bytes, got ${salt.length}`);
  }
  if (jurorBytes.length !== 32) {
    throw new Error(
      `InvalidJuror: expected 32-byte pubkey, got ${jurorBytes.length}`,
    );
  }
  const preimage = new Uint8Array(COMMIT_PREIMAGE_LEN);
  preimage[0] = vote;
  preimage.set(salt, 1);
  preimage.set(jurorBytes, 33);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", preimage);
  return new Uint8Array(digest);
}

/** Validate a vote fits `0..numOptions` (lib.rs:1092). Pure. */
export function assertValidVote(vote: number, numOptions: number): void {
  if (!Number.isInteger(vote) || vote < 0 || vote >= numOptions) {
    throw new Error(`InvalidVote: expected 0..${numOptions}, got ${vote}`);
  }
}

/** Validate the salt is 32 bytes. Pure. */
export function assertValidSalt(salt: Uint8Array): void {
  if (salt.length !== 32) {
    throw new Error(`InvalidSalt: expected 32 bytes, got ${salt.length}`);
  }
}

/**
 * Build the Round PDA seed bytes (state.rs:2124):
 *   `["round", dispute.key(), &current_round.to_le_bytes()]`.
 *
 * `roundIdx` is `u32` little-endian (4 bytes). Pure + deterministic.
 */
export function roundSeeds(
  disputeBytes: Uint8Array,
  roundIdx: number,
): Uint8Array[] {
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff) {
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  }
  const le = new Uint8Array(4);
  new DataView(le.buffer).setUint32(0, roundIdx, true);
  return [SEED_ROUND, disputeBytes, le];
}

/** Derive the canonical Round PDA. Kit lazy-imported. */
export async function findRoundPda(
  programAddress: Address,
  dispute: Address,
  roundIdx: number,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } =
    await import("@solana/kit");
  const disputeBytes = new Uint8Array(getAddressEncoder().encode(dispute));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: roundSeeds(disputeBytes, roundIdx),
  });
  return { address, bump };
}

/**
 * Seam to the Codama-generated Kit client (ADR-0010). Foundation provides the
 * concrete adapter; voting.ts stays orchestration-only, so it is parallel-safe
 * under fleet dispatch and compile-verifiable before the generator lands.
 */
export interface AccordVotingClient {
  buildCommit(input: {
    programId: Address;
    accounts: VotingAccounts;
    commitment: Uint8Array; // [u8; 32]
  }): Instruction;
  buildReveal(input: {
    programId: Address;
    accounts: VotingAccounts;
    vote: number;
    salt: Uint8Array;
  }): Instruction;
  buildFinalizeRound(input: {
    programId: Address;
    accounts: VotingAccounts;
    remainingAccounts?: Address[];
  }): Instruction;
  buildFinalizeDispute(input: {
    programId: Address;
    accounts: VotingAccounts;
    /** remaining_accounts: drawn JurorStake PDAs (+ AppealBond PDAs). */
    remainingAccounts: Address[];
  }): Instruction;
  /** `redraw` (ADR-0021) — see {@link redraw}. */
  buildRedraw(input: {
    programId: Address;
    accounts: RedrawAccounts;
    remainingAccounts?: Address[];
  }): Instruction;
  /** Encode a juror Address to its 32-byte pubkey (Kit `getAddressEncoder`). */
  encodeAddress(address: Address): Uint8Array;
}

/**
 * Build a `commit` instruction: compute `commitHash(vote, salt, juror)` and
 * hand the 32-byte commitment to the chain (lib.rs:1041). The juror must be
 * drawn into the round and inside the commit window; those gates are enforced
 * on-chain. Returns the instruction + the computed commitment (for local
 * bookkeeping / indexing).
 */
export async function commit(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  args: VoteArgs,
): Promise<{ instruction: Instruction; commitment: Uint8Array }> {
  assertValidSalt(args.salt);
  if (args.vote < 0 || args.vote > 0xff) {
    throw new Error(`InvalidVote: vote must fit a u8, got ${args.vote}`);
  }
  const jurorBytes = client.encodeAddress(accounts.signer);
  const commitment = await commitHash(args.vote, args.salt, jurorBytes);
  const instruction = client.buildCommit({
    programId,
    accounts,
    commitment,
  });
  return { instruction, commitment };
}

/**
 * Build a `reveal` instruction with `{vote, salt}` (lib.rs:1085). The chain
 * recomputes `hash(vote ‖ salt ‖ juror)` and checks it equals the stored
 * commitment — so `args` MUST be the exact pair used in {@link commit}.
 */
export function reveal(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  args: VoteArgs,
): Instruction {
  if (args.vote < 0 || args.vote > 0xff) {
    throw new Error(`InvalidVote: vote must fit a u8, got ${args.vote}`);
  }
  assertValidSalt(args.salt);
  // ponytail: ADR-0020 moved reveal's fee credit to finalize_round — on-chain
  // Reveal (lib.rs) takes only juror/subaccord/dispute/round. The optional
  // token fields on VotingAccounts are vestigial; the adapter ignores them.
  return client.buildReveal({
    programId,
    accounts,
    vote: args.vote,
    salt: args.salt,
  });
}

/**
 * Build the permissionless `finalize_round` crank (lib.rs:1136). After the
 * reveal window elapses, anyone can advance the dispute to `RoundResolved` with
 * the plurality winner written to `round.result`. ADR-0020: credits
 * `fees_earned` to each revealer — pass the panel's JurorStake PDAs as
 * `remainingAccounts` when `fee_per_juror > 0`.
 */
export function finalizeRound(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  remainingAccounts: Address[] = [],
): Instruction {
  return client.buildFinalizeRound({ programId, accounts, remainingAccounts });
}

/**
 * Build the permissionless `finalize_dispute` crank (lib.rs:1187). After the
 * appeal window elapses, anyone can settle the final round: slash incoherent
 * jurors, redistribute the pool, decrement `active_draws`, and write
 * `final_ruling` (transition to `Final`).
 *
 * `remainingAccounts` = the drawn `JurorStake` PDAs (panel), followed by one
 * `AppealBond` PDA per prior appeal (`current_round` of them). With no appeals
 * this collapses to just the juror stakes.
 */
export function finalizeDispute(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  remainingAccounts: Address[],
): Instruction {
  return client.buildFinalizeDispute({
    programId,
    accounts,
    remainingAccounts,
  });
}

// --- Shortfall redraw (ADR-0021) -------------------------------------------

/**
 * Accounts for `redraw` (lib.rs). The Fail branch refunds the filer from
 * `feeVault`, so it carries the filer's `feeToken` ATA + the vault (validated
 * but unused on the Redraw branch).
 */
export interface RedrawAccounts {
  /** Permissionless cranker. */
  caller: Address;
  subaccord: Address;
  dispute: Address;
  /** The shortfall round (`dispute.current_round`). */
  round: Address;
  feeToken: Address;
  /** Filer's `feeToken` ATA — refund destination on exhaustion. */
  filerTokenAccount: Address;
  feeVault: Address;
  tokenProgram: Address;
}

/**
 * Build the permissionless `redraw` crank (lib.rs, ADR-0021). Only callable
 * from `RedrawEligible`. Slashes no-shows into `stake_delta`, bumps
 * `round.draw_attempt` (orthogonal to `round_idx` — same panel size, no appeal
 * consumed), clears the round → `Created`; on `draw_attempt + 1 ≥
 * max_draw_attempts` → `Failed` (filer `fee_paid` refunded, slashes stand).
 *
 * `remainingAccounts` = the round's drawn `JurorStake` PDAs (panel); on the Fail
 * branch additionally prior-round `Round` PDAs + their `JurorStake` PDAs + the
 * dispute's `AppealBond` PDAs (same layout as `cancel_dispute`).
 */
export function redraw(
  client: AccordVotingClient,
  programId: Address,
  accounts: RedrawAccounts,
  remainingAccounts: Address[] = [],
): Instruction {
  return client.buildRedraw({ programId, accounts, remainingAccounts });
}
