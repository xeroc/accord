/**
 * voting.ts — commit-reveal voting + finalization cranks (ADR-0010) with
 * scalar u64 votes (ADR-0025).
 *
 * The load-bearing client-side cryptography lives here: the commit hash
 *   `sha256(vote_le[8] ‖ salt[32] ‖ juror_pubkey[32])`
 * where `vote_le` is the vote's 8-byte little-endian encoding — votes are
 * `u64` on the wire (option index for `Plurality`, fixed-point scalar in
 * settlement-mint base units for `Median`). The on-chain `reveal`
 * recomputes this via `solana_program::hash::hashv` (instructions/reveal.rs:
 * `hashv(&[&vote.to_le_bytes(), &salt, juror_key.as_ref()])`) and checks it
 * against the stored commitment. Mismatching the byte order or lengths here
 * silently breaks every dispute, so `commitHash` is unit-tested against a
 * hardcoded digest vector.
 *
 * Four instructions are orchestrated:
 *   - {@link commit}         juror commits `hash(vote, salt, juror)`.
 *   - {@link reveal}         juror reveals `{vote, salt}` (chain re-derives hash).
 *   - {@link finalizeRound}  permissionless crank: tally (plurality or median) → RoundResolved.
 *   - {@link finalizeDispute} permissionless crank: settles economics, writes ruling.
 *
 * As in dispute.ts, the module is pure facade orchestration over a typed
 * {@link AccordVotingClient} seam that Foundation wires to the Codama-generated
 * Kit client. Kit is imported type-only (erased at runtime); the PDA helper
 * lazy-imports Kit so the unit tests load zero runtime deps.
 *
 * Sources of truth:
 *   - commit/reveal/finalize_*: programs/accord/src/instructions/{commit,reveal,finalize_round,finalize_dispute}.rs
 *   - Round struct + seeds:     programs/accord/src/state.rs (Round, SEED_ROUND)
 */
import type { Address, Instruction } from "@solana/kit";

/**
 * No-reveal sentinel: `u64::MAX` marks "not revealed" in `Round.reveals` and
 * "not set" in `Round.result` (ADR-0025; was `u8::MAX` before scalar votes).
 * Both aggregation modes reject it as an actual vote on-chain.
 */
export const NO_VOTE = 0xffff_ffff_ffff_ffffn;

/** Round PDA seed prefix, `b"round"` (state.rs: SEED_ROUND). */
const SEED_ROUND = new Uint8Array([114, 111, 117, 110, 100]); // "round"

/** Commit-hash preimage length: 8 vote bytes (u64 LE) + 32 salt + 32 juror pubkey. */
const COMMIT_PREIMAGE_LEN = 8 + 32 + 32;

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
  /**
   * The vote, `u64` on the wire (ADR-0025): an option index for `Plurality`
   * disputes or a scaled scalar for `Median` (see {@link encodeScalarVote}).
   */
  vote: bigint;
  /** 32-byte random salt — secret until reveal. */
  salt: Uint8Array;
}

/**
 * Compute the commit hash `sha256(vote_le[8] ‖ salt[32] ‖ juror_pubkey[32])`.
 *
 * Bit-for-bit compatible with the on-chain `reveal` check
 * (instructions/reveal.rs): `hashv(&[&vote.to_le_bytes(), &salt,
 * juror_key.as_ref()]).to_bytes()` — the vote is hashed as 8-byte
 * little-endian (ADR-0025), so the preimage is 72 bytes.
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle`): zero-dependency,
 * available in Node ≥ 18 and all browsers. `jurorBytes` is the juror's 32-byte
 * pubkey encoding (Kit's `getAddressEncoder().encode(juror)`).
 */
export async function commitHash(
  vote: bigint,
  salt: Uint8Array,
  jurorBytes: Uint8Array,
): Promise<Uint8Array> {
  if (typeof vote !== "bigint" || vote < 0n || vote > NO_VOTE) {
    throw new Error(`InvalidVote: vote must fit a u64 bigint, got ${vote}`);
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
  new DataView(preimage.buffer).setBigUint64(0, vote, true); // vote LE
  preimage.set(salt, 8);
  preimage.set(jurorBytes, 40);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", preimage);
  return new Uint8Array(digest);
}

/**
 * Validate an option-index vote for `Plurality` disputes: `vote <
 * num_options` (instructions/reveal.rs). `Median` scalars carry no
 * client-side range beyond the u64 fit checked in {@link commitHash} and the
 * facades. Pure.
 */
export function assertValidVote(vote: bigint, numOptions: number): void {
  if (vote < 0n || vote >= BigInt(numOptions)) {
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
 * Client-side mirror of the vote gates common to both aggregation modes
 * (instructions/reveal.rs): the vote must be a u64 and must not be the
 * no-reveal sentinel — `Plurality` bounds it further to a real option index
 * ({@link assertValidVote}); `Median` only excludes the sentinel.
 */
function assertVotable(vote: bigint): void {
  if (typeof vote !== "bigint" || vote < 0n || vote >= NO_VOTE) {
    throw new Error(
      `InvalidVote: expected a u64 below the no-reveal sentinel, got ${vote}`,
    );
  }
}

/**
 * Encode a human-readable scalar vote (ADR-0025 `Median` disputes) as the
 * u64 base-unit bigint the wire takes: `input · 10^decimals`. Accepts plain
 * decimal strings (`"123"`, `"123.45"`); rejects anything else (sign,
 * exponent, separators, empty string) and fractions longer than `decimals`.
 * The `u64` fit is enforced downstream ({@link commitHash} / the facades).
 * Inverse of {@link decodeScalarVote}.
 */
export function encodeScalarVote(input: string, decimals = 6): bigint {
  const m = /^([0-9]+)(?:\.([0-9]+))?$/.exec(input);
  if (!m) {
    throw new Error(
      `InvalidScalarVote: expected a plain decimal string like "123" or "123.45", got ${JSON.stringify(input)}`,
    );
  }
  const frac = m[2] ?? "";
  if (frac.length > decimals) {
    throw new Error(
      `InvalidScalarVote: ${frac.length} fraction digits exceed decimals=${decimals}: ${JSON.stringify(input)}`,
    );
  }
  return BigInt(m[1]! + frac.padEnd(decimals, "0"));
}

/**
 * Decode a u64 base-unit vote back to a plain decimal string (inverse of
 * {@link encodeScalarVote}): `123450000n` → `"123.45"` at the default 6
 * decimals. Trailing fraction zeros are trimmed; a zero fraction collapses
 * to the integer form. Pure.
 */
export function decodeScalarVote(vote: bigint, decimals = 6): string {
  if (vote < 0n) {
    throw new Error(
      `InvalidScalarVote: expected a non-negative u64, got ${vote}`,
    );
  }
  if (decimals === 0) return vote.toString();
  const padded = vote.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
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
    vote: bigint;
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
 * hand the 32-byte commitment to the chain (instructions/commit.rs). The
 * juror must be drawn into the round and inside the commit window; those
 * gates are enforced on-chain. Returns the instruction + the computed
 * commitment (for local bookkeeping / indexing).
 */
export async function commit(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  args: VoteArgs,
): Promise<{ instruction: Instruction; commitment: Uint8Array }> {
  assertValidSalt(args.salt);
  assertVotable(args.vote);
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
 * Build a `reveal` instruction with `{vote, salt}` (instructions/reveal.rs).
 * The chain recomputes `hash(vote_le ‖ salt ‖ juror)` and checks it equals
 * the stored commitment — so `args` MUST be the exact pair used in
 * {@link commit}.
 */
export function reveal(
  client: AccordVotingClient,
  programId: Address,
  accounts: VotingAccounts,
  args: VoteArgs,
): Instruction {
  assertVotable(args.vote);
  assertValidSalt(args.salt);
  // ponytail: ADR-0020 moved reveal's fee credit to finalize_round — on-chain
  // Reveal (instructions/reveal.rs) takes only juror/subaccord/dispute/round.
  // The optional token fields on VotingAccounts are vestigial; the adapter
  // ignores them.
  return client.buildReveal({
    programId,
    accounts,
    vote: args.vote,
    salt: args.salt,
  });
}

/**
 * Build the permissionless `finalize_round` crank
 * (instructions/finalize_round.rs). After the reveal window elapses, anyone
 * can advance the dispute to `RoundResolved` with the tally winner written
 * to `round.result` (plurality option or median scalar, ADR-0025).
 * ADR-0020: credits
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
 * Build the permissionless `finalize_dispute` crank
 * (instructions/finalize_dispute.rs). After the appeal window elapses,
 * anyone can settle the final round: slash incoherent
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
