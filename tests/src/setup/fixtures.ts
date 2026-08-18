// fixtures.ts — deterministic-ish builders shared across specs.
// Kept free of chain access so they're usable in any lane (incl. offline).

import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { sha256 } from "@noble/hashes/sha256";
import {
  Aggregation,
  DEFAULT_APPEAL_WINDOW_SECS,
  ShortfallPolicy,
  type CreateSubaccordArgs,
} from "@useaccord/sdk";

/** Solana `Pubkey::default()` (all-ones). Used as `authority` ⇒ immutable Subaccord. */
export const DEFAULT_PUBKEY: Address = address(
  "11111111111111111111111111111111",
);

/** Cryptographically random 32 bytes. Unique per call ⇒ unique domain_ref/PDA. */
export function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Canonical `create_subaccord` args for tests, from AGENTS.md "v1 Defaults".
 * `domain_ref`/`evidence_spec` are freshly random so each run mints a distinct
 * Subaccord PDA (namespace-squat guard requires domain_ref ≠ 0). Override any
 * field via `overrides`.
 */
export function defaultSubaccordArgs(
  stakingToken: Address,
  feeToken: Address,
  evidenceOperator: Address,
  overrides: Partial<CreateSubaccordArgs> = {},
): CreateSubaccordArgs {
  return {
    domainRef: randomBytes32(),
    evidenceSpec: randomBytes32(),
    stakingToken,
    feeToken,
    minStake: 1_000n,
    alphaBps: 1_000, // 10%
    reviewWindow: 604_800n, // 7 days
    commitWindow: 172_800n, // 2 days
    revealWindow: 172_800n, // 2 days
    appealWindow: DEFAULT_APPEAL_WINDOW_SECS, // 3 days (ADR-0022)
    maxAppeals: 3,
    minJurySize: 3,
    aggregation: Aggregation.Plurality,
    feePerJuror: 0n,
    revealThresholdBps: 6_666, // 2/3 (ADR-0021)
    shortfallPolicy: ShortfallPolicy.Redraw, // ADR-0021
    maxDrawAttempts: 3, // ADR-0021
    coherenceTolBps: 0, // Plurality default — exact-match coherence (ADR-0025)
    authority: DEFAULT_PUBKEY, // immutable
    evidenceOperator,
    depth: 4, // small for tests (2^4 = 16 seats max)
    ...overrides,
  };
}

// --- Synod (N-party dispute-escrow Arbitrable) — e2e-side pins --------------
//
// Interim harness pins for `programs/synod` (SPEC: PDA ["case", opener, nonce],
// options/evidence derivations, frozen-fee economics). When `@useaccord/synod`
// ships (bean accord-nsxa), its `SYNOD_PROGRAM_ID` + `findCasePda` + codecs
// supersede these — a one-line swap per helper, kept central for exactly that.

/** Synod program id — scaffold canonical keypair (Anchor.toml [programs.localnet]). */
export const SYNOD_PROGRAM_ID: Address = address(
  "5o5VDoAZJFTJaBKJjhPMLMMPa8nmqgZdSkUFubNdAxZx",
);

/** `SynodCase` seed: `["case", opener, nonce]` (nonce u64 LE, codama convention). */
export const CASE_SEED = new Uint8Array([99, 97, 115, 101]); // "case"

/** SynodCase PDA: seeds `["case", opener, nonce]` (u64 LE nonce). */
export async function synodCasePda(
  opener: Address,
  nonce: number | bigint,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: SYNOD_PROGRAM_ID,
    seeds: [
      CASE_SEED,
      new Uint8Array(getAddressEncoder().encode(opener)),
      new Uint8Array(getU64Encoder().encode(nonce)),
    ],
  });
  return pda;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const SYNOD_OPT_PREFIX = new TextEncoder().encode("synod-opt");

/**
 * Option label `i` for a case: `sha256("synod-opt" ‖ case_pda ‖ i)` with the
 * party index as a single u8 (on-chain `party_count`/`paid_out` are u8-bitmask
 * slots). Neutral is `i === partyCount` (highest index). SPEC §Instructions #3.
 */
export function synodOptionLabel(casePda: Address, i: number): Uint8Array {
  return sha256(
    concat(
      SYNOD_OPT_PREFIX,
      new Uint8Array(getAddressEncoder().encode(casePda)),
      new Uint8Array([i]),
    ),
  );
}

/**
 * Dispute evidence hash: `sha256(case_pda ‖ e_0 ‖ … ‖ e_{N-1})` over the
 * per-party 32-byte hashes in naming order (join order is irrelevant — slots
 * are positional). SPEC §Instructions #3.
 */
export function synodEvidenceHash(
  casePda: Address,
  evidence: Uint8Array[],
): Uint8Array {
  return sha256(
    concat(new Uint8Array(getAddressEncoder().encode(casePda)), ...evidence),
  );
}

export interface SynodEconomics {
  /** Frozen at open: `initial_num_jurors · fee_per_juror` from the Subaccord. */
  frozenFee: bigint;
  /** Prevailing-party pot: `N·S − fee`. */
  pot: bigint;
  /** Neutral-ruling share per party: `S − floor(fee/N)`. */
  neutralShare: bigint;
  /** Last neutral claimant's share — absorbs the indivisibility remainder. */
  lastNeutralShare: bigint;
  /** Failed-dispute share per party: `S` in full (fee un-consumed). */
  failedShare: bigint;
}

/**
 * Pure payout math per SPEC §Instructions #5 / §Economics. Conservation
 * invariant: `(N−1)·neutralShare + lastNeutralShare === pot`.
 */
export function synodEconomics(params: {
  partyCount: number;
  stake: bigint;
  feePerJuror: bigint;
  initialNumJurors: number | bigint;
}): SynodEconomics {
  const n = BigInt(params.partyCount);
  const frozenFee = BigInt(params.initialNumJurors) * params.feePerJuror;
  const pot = n * params.stake - frozenFee;
  const neutralShare = params.stake - frozenFee / n;
  const lastNeutralShare = pot - (n - 1n) * neutralShare;
  return {
    frozenFee,
    pot,
    neutralShare,
    lastNeutralShare,
    failedShare: params.stake,
  };
}

/** `n` distinct party signers, opener at index 0 (naming order). Unfunded —
 * `fundSigner` them in the spec; stake S via `setTokenBalance` on their ATAs. */
export async function synodRoster(
  n: number,
): Promise<KeyPairSigner[]> {
  return Promise.all(Array.from({ length: n }, () => generateKeyPairSigner()));
}
