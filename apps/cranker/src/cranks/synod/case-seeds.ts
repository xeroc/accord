/**
 * Case-seed recovery (bean accord-unja).
 *
 * The SynodCase PDA is seeded `["case", opener, nonce_le]` and the account
 * deliberately stores no seed backrefs (SPEC §Account model), yet every synod
 * crank (`file_dispute` / `refund_roster_miss` / `claim`) re-derives the PDA
 * from `(opener, nonce)` via its seeds constraint — the cranker, which
 * discovers cases by scanning, must recover them to build any instruction.
 *
 * The opener is `parties[0]` (naming order, opener = index 0). The nonce is
 * NOT on-chain anywhere, so it is recovered by a bounded local scan over
 * `findCasePda` — pure PDA math, no RPC, ~3.4ms per probe on this stack.
 * Openers who want crank coverage should use small sequential nonces
 * (per-opener counters); anything beyond the cap is unreachable and the
 * executor skips with that reason (the app's manual buttons — which know the
 * nonce they chose — are the fallback).
 *
 * Results are cached per case for the process lifetime, INCLUDING misses: the
 * nonce is immutable, so a scanned-and-not-found case must not be rescanned
 * every poll cycle.
 */
import type { Address } from "@solana/kit";

import { findCasePda } from "@useaccord/synod";

/**
 * Scan ceiling. 4_096 probes ≈ 14s worst case, paid once per unrecoverable
 * case (negative-cached afterwards). Covers any sane per-opener counter;
 * deliberately modest because each probe is an async PDA derivation.
 */
export const NONCE_SCAN_CAP = 4_096;

/** The recovered case-PDA seed components every synod crank needs. */
export interface CaseSeeds {
  opener: Address;
  nonce: bigint;
}

/** case-address → recovered seeds, or null when the scan found nothing. */
const recovered = new Map<string, CaseSeeds | null>();

/**
 * Recover `(opener, nonce)` for a case PDA by scanning nonces `[0, cap)`.
 * Returns `null` when no nonce in range derives the address. Cached per case —
 * positive and negative alike.
 */
export async function recoverCaseSeeds(
  opener: Address,
  casePda: Address,
  cap: number = NONCE_SCAN_CAP,
): Promise<CaseSeeds | null> {
  const key = casePda.toString();
  if (recovered.has(key)) {
    return recovered.get(key) ?? null;
  }
  let seeds: CaseSeeds | null = null;
  for (let nonce = 0n; nonce < BigInt(cap); nonce++) {
    const [pda] = await findCasePda({ opener, nonce });
    if (pda === casePda) {
      seeds = { opener, nonce };
      break;
    }
  }
  recovered.set(key, seeds);
  return seeds;
}
