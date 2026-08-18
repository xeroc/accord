/**
 * dispute.ts — the PRIMARY external surface of @useaccord/sdk.
 *
 * Two methods every Arbitrable integrates against:
 *   - {@link createDispute} — files a Dispute (CPI from an Arbitrable program,
 *   - {@link getRuling}    — lazy read of a dispute's `final_ruling`
 *     (u64 with the `u64::MAX` no-ruling sentinel; `null` until the dispute
 *     reaches `Final` — ADR-0025).
 *
 * Per ADR-0010 the SDK is two layers: a Codama-generated Kit client (drift-free
 * instruction builders + account codecs) and a thin hand-written facade that
 * owns domain logic. This module is the facade layer for dispute intake; it
 * stays orchestration-only and consumes the generated client through the
 * {@link AccordDisputeClient} seam, which the Foundation task wires to a real
 * adapter. The domain logic that is NOT generated — PDA derivation, fee math,
 * option validation — lives here and is unit-tested independently of the chain.
 *
 * Sources of truth:
 *   - Instruction + accounts: programs/accord/src/lib.rs (create_dispute, get_ruling)
 *   - Dispute struct + seeds: programs/accord/src/state.rs (Dispute, SEED_DISPUTE)
 *   - v1 constants:           programs/accord/src/constants.rs (MAX_OPTIONS)
 */

import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import { MAX_OPTIONS } from "../constants.js";
import { Aggregation } from "../types.js";

export { MAX_OPTIONS } from "../constants.js";

/** Accord program id (declare_id! in programs/accord/src/lib.rs). */
export const ACCORD_PROGRAM_ID =
  "RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe" as Address;

/** u64 ceiling — guards fee math against overflow (lib.rs uses checked_mul). */
const U64_MAX = 0xffffffffffffffffn;

/** Dispute PDA seed prefix, `b"dispute"` (state.rs: SEED_DISPUTE). */
const SEED_DISPUTE = new Uint8Array([100, 105, 115, 112, 117, 116, 101]);

/**
 * A 32-byte option label hash (one row of `Dispute.options`). The Arbitrable
 * chooses these off-chain; the Accord only stores + tallies them.
 */
export type OptionHash = Uint8Array;

/**
 * Args for `create_dispute` (lib.rs:254). All amounts in the Subaccord's
 * staking token.
 */
export interface CreateDisputeArgs {
  /**
   * Option label hashes, each 32 bytes. `Plurality`: 2..={@link MAX_OPTIONS}
   * (see {@link assertValidOptions}). `Median` (ADR-0025): file with none —
   * the vote is a u64 fixed-point scalar, not an index.
   */
  options: OptionHash[];
  /** ADR-0006 on-chain evidence commitment (`[u8; 32]`). */
  evidenceHash: Uint8Array;
  /** Filer-chosen nonce → private dispute namespace. Dispute PDA = `["dispute", filer, nonce]`. */
  nonce: bigint;
  /** Total fee = `min_jury_size * fee_per_juror` (see {@link requiredFee}). Filer pays in full. */
  fee: bigint;
  /**
   * Aggregation rule of the Subaccord being filed against — gates
   * {@link CreateDisputeArgs.options} exactly like the on-chain handler
   * (instructions/create_dispute.rs). Omit for `Plurality` (v1 default).
   */
  aggregation?: Aggregation;
}

/** Signer + token accounts the filer brings to `create_dispute`. */
export interface CreateDisputeAccounts {
  /** The Arbitrable (a program signer via CPI) or any wallet. Fee source + signer. */
  filer: Address;
  /**
   * Data-free rent payer for the dispute `init` + fee_vault `init_if_needed`
   * (the system program rejects lamport transfers from data-carrying accounts,
   * so a PDA filer must not pay rent). Wallet filers pass themselves.
   */
  rentPayer: Address;
  /** The Subaccord this dispute is filed against (fee/panel source). */
  subaccord: Address;
  /** The Subaccord's staking_token mint (fee currency). */
  feeToken: Address;
  /** Filer's ATA of the fee token (fee source). */
  filerTokenAccount: Address;
  /** Subaccord PDA's fee_vault ATA (fee sink, ADR-0020). */
  feeVault: Address;
  /** Circuit-breaker singleton PDA (`["state"]`); stake/create revert while paused. */
  accordState: Address;
}

/** Result of preparing a `create_dispute`: the derived Dispute PDA + its instruction. */
export interface CreateDisputeResult {
  /** The initialized Dispute PDA (`["dispute", filer, nonce]`). */
  dispute: Address;
  /** Canonical bump stored on the account (state.rs: Dispute.bump). */
  bump: number;
  /** Unsigned instruction; the facade's wallet adapter signs + sends it. */
  instruction: Instruction;
}

/** Minimal decoded view `getRuling` consumes (avoids duplicating the full Dispute shape). */
export interface DisputeRulingView {
  /**
   * Winning value once `state == Final`: the option index for `Plurality`
   * disputes, the final median (settlement-mint base units) for `Median`
   * disputes (ADR-0025). `u64::MAX` ({@link NO_RULING}) → `null`.
   */
  finalRuling: bigint | null;
}

/**
 * Dispute `final_ruling` no-ruling sentinel — `u64::MAX`. ADR-0025 widened
 * the ruling from `Option<u8>` to a plain u64 (so `Median` disputes can carry
 * a scalar verdict); the old `u8::MAX` (255) sentinel is gone. Stored until
 * `finalize_dispute` writes the real value atomically with `state = Final`
 * (state.rs: `Dispute::ruling`). Same value as voting's `NO_VOTE`.
 */
export const NO_RULING = 0xffff_ffff_ffff_ffffn;

/**
 * Seam to the Codama-generated Kit client + typed fetcher (ADR-0010). The
 * Foundation task provides a concrete adapter; dispute.ts stays pure
 * orchestration over this interface, so it is parallel-safe under fleet
 * dispatch and compile-verifiable before the generator lands.
 */
export interface AccordDisputeClient {
  /** Build the `create_dispute` instruction (Anchor discriminator + Borsh args). */
  buildCreateDispute(input: {
    programId: Address;
    accounts: CreateDisputeAccounts;
    args: CreateDisputeArgs;
    disputePda: Address;
  }): Instruction;
  /** Fetch + decode a Dispute account, or `null` if it does not exist yet. */
  fetchDispute(address: Address): Promise<DisputeRulingView | null>;
}

/**
 * Compute the required `create_dispute` round-1 fee. The panel is the
 * Subaccord's `min_jury_size` (accord-9q3e; default 3), so the fee is
 * `min_jury_size · fee_per_juror`. Mirrors lib.rs
 * (`(sub.min_jury_size as u64).checked_mul(sub.fee_per_juror)`). Returns `null`
 * on u64 overflow rather than throwing — callers surface a typed error.
 */
export function requiredFee(
  feePerJuror: bigint,
  minJurySize: number = 3,
): bigint | null {
  if (feePerJuror < 0n || !Number.isInteger(minJurySize) || minJurySize < 1) {
    return null;
  }
  const product = BigInt(minJurySize) * feePerJuror;
  if (product < 0n || product > U64_MAX) return null;
  return product;
}
/**
 * Validate `create_dispute` options against the Subaccord's aggregation rule
 * (instructions/create_dispute.rs, ADR-0025). `Plurality` (default):
 * `2..=MAX_OPTIONS` hashes, each `[u8; 32]`. `Median`: none — the vote is a
 * u64 scalar, not an option index. Throws a typed `Error` on violation.
 * Pure — no chain access.
 */
export function assertValidOptions(
  options: OptionHash[],
  aggregation: Aggregation = Aggregation.Plurality,
): void {
  if (aggregation === Aggregation.Median) {
    if (options.length !== 0) {
      throw new Error(
        `InvalidOptions: Median (scalar) disputes file without option hashes, got ${options.length}`,
      );
    }
    return;
  }
  if (options.length < 2 || options.length > MAX_OPTIONS) {
    throw new Error(
      `InvalidOptions: expected 2..=${MAX_OPTIONS} options, got ${options.length}`,
    );
  }
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (opt === undefined || opt.length !== 32) {
      throw new Error(
        `InvalidOptions: option ${i} must be 32 bytes, got ${opt?.length ?? 0}`,
      );
    }
  }
}

/** Validate the evidence commitment is `[u8; 32]` (lib.rs:257 instruction arg). */
export function assertValidEvidenceHash(evidenceHash: Uint8Array): void {
  if (evidenceHash.length !== 32) {
    throw new Error(
      `InvalidEvidenceHash: expected 32 bytes, got ${evidenceHash.length}`,
    );
  }
}

/** Validate a `nonce` fits in a u64 (lib.rs:258 instruction arg). */
export function assertValidNonce(nonce: bigint): void {
  if (nonce < 0n || nonce > U64_MAX) {
    throw new Error(`InvalidNonce: expected u64, got ${nonce}`);
  }
}

/**
 * Build the Dispute PDA seed bytes (state.rs:1872):
 *   `["dispute", filer.key().as_ref(), &nonce.to_le_bytes()]`.
 *
 * `filerBytes` is the filer's 32-byte pubkey encoding (Kit's
 * `getAddressEncoder().encode(filer)`). Pure + deterministic — the unit-test
 * entry point; {@link findDisputePda} wraps it with Kit's resolver.
 */
export function disputeSeeds(
  filerBytes: Uint8Array,
  nonce: bigint,
): Uint8Array[] {
  const nonceLe = new Uint8Array(8);
  new DataView(nonceLe.buffer).setBigUint64(0, nonce, true);
  return [SEED_DISPUTE, filerBytes, nonceLe];
}

/**
 * Derive the canonical Dispute PDA (`["dispute", filer, nonce.to_le()]`).
 */
export async function findDisputePda(
  programAddress: Address,
  filer: Address,
  nonce: bigint,
): Promise<{ address: Address; bump: number }> {
  // kit's encoder returns ReadonlyUint8Array (TS 5.7+ typed-array generics);
  // copy into a mutable Uint8Array for the seeds vector.
  const filerBytes = new Uint8Array(getAddressEncoder().encode(filer));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: disputeSeeds(filerBytes, nonce),
  });
  return { address, bump };
}

/**
 * Prepare a `create_dispute`: validate args, derive the Dispute PDA, and build
 * the instruction via the client seam. The caller (Accord facade) signs + sends
 * `result.instruction` with its wallet adapter.
 *
 * On success the Dispute PDA is `init`-ialized (instructions/create_dispute.rs)
 * and reads `state == Created`, `final_ruling == u64::MAX` ({@link NO_RULING}).
 */
export async function createDispute(
  client: AccordDisputeClient,
  accounts: CreateDisputeAccounts,
  args: CreateDisputeArgs,
  programId: Address = ACCORD_PROGRAM_ID,
): Promise<CreateDisputeResult> {
  assertValidOptions(args.options, args.aggregation);
  assertValidEvidenceHash(args.evidenceHash);
  assertValidNonce(args.nonce);
  const { address, bump } = await findDisputePda(
    programId,
    accounts.filer,
    args.nonce,
  );
  const instruction = client.buildCreateDispute({
    programId,
    accounts,
    args,
    disputePda: address,
  });
  return { dispute: address, bump, instruction };
}

/**
 * Lazily read a dispute's final ruling. Returns the winning value once the
 * dispute reaches `Final` — the option index for `Plurality` disputes, the
 * final median in settlement-mint base units for `Median` disputes
 * (ADR-0025) — or `null` beforehand; on-chain `final_ruling` holds the
 * `u64::MAX` sentinel ({@link NO_RULING}) until then, and both the adapter
 * and {@link getRuling} fold it to `null` (matches the on-chain `get_ruling`
 * CPI entry, lib.rs:480 → `Dispute::ruling()`). Returns `null` if the
 * Dispute account does not exist yet.
 */
export async function getRuling(
  client: AccordDisputeClient,
  dispute: Address,
): Promise<bigint | null> {
  const view = await client.fetchDispute(dispute);
  // Defense in depth: the adapter already folds the sentinel, but fold here
  // too so no seam implementor can leak it — same posture as on-chain
  // `Dispute::ruling()` (state.rs) checking the sentinel even though the
  // Final⟺ruling-written invariant makes it unreachable.
  const fr = view?.finalRuling ?? NO_RULING;
  return fr === NO_RULING ? null : fr;
}
