/**
 * newCaseForm.ts — pure client-side gates for the new-case form (accord-3rk5).
 *
 * Mirrors the on-chain `open_case` validation so the form can disable submit
 * before a tx is ever simulated:
 *   - roster: 2..=7 distinct parties, opener at index 0
 *   - economics: frozen fee `minJurySize · feePerJuror` (fee snapshot taken at
 *     open — SPEC §open_case); the pot `N·S` must strictly exceed it
 *   - court gate: only Plurality Subaccords can host Synod cases (on-chain
 *     gate at open_case; ADR-0019)
 *
 * No React, no RPC — the page owns fetching + sending.
 */

import { isAddress, type Address } from "@solana/kit";
import { Aggregation } from "@useaccord/sdk";

/** Roster bounds (SPEC: named 2–7 party roster). */
export const MIN_PARTIES = 2;
export const MAX_PARTIES = 7;

/** Human-readable roster problems; empty array = ready to open. */
export function validateRoster(opener: Address, named: readonly string[]): string[] {
  const errors: string[] = [];
  const total = named.length + 1;
  if (total < MIN_PARTIES || total > MAX_PARTIES) {
    errors.push(`Parties: roster is ${total} total — name ${MIN_PARTIES}–${MAX_PARTIES} parties (you are party 1).`);
  }
  const seen = new Set<string>([opener]);
  named.forEach((raw, i) => {
    const addr = raw.trim();
    if (!isAddress(addr)) {
      errors.push(`Party ${i + 2}: not a valid address.`);
      return;
    }
    if (seen.has(addr)) {
      errors.push(`Duplicate party: ${addr} — the roster must be distinct.`);
    }
    seen.add(addr);
  });
  return errors;
}

/** Frozen-fee + pot preview for a candidate case. Total function — the UI
 * gates on `coversFee` and a positive stake separately. */
export interface FeePreview {
  /** Total roster size (named + opener). */
  partyCount: number;
  /** `minJurySize · feePerJuror`, frozen at open. */
  frozenFee: bigint;
  /** Escrowed pot `N·S`. */
  pot: bigint;
  /** Winner payout `N·S − fee`. */
  netToWinner: bigint;
  /** `pot > frozenFee` — the on-chain sufficiency gate (strict). */
  coversFee: boolean;
}

export function feePreview(
  sub: { minJurySize: number; feePerJuror: bigint },
  stake: bigint,
  namedCount: number,
): FeePreview {
  const partyCount = namedCount + 1;
  const frozenFee = BigInt(sub.minJurySize) * sub.feePerJuror;
  const pot = BigInt(partyCount) * stake;
  return {
    partyCount,
    frozenFee,
    pot,
    netToWinner: pot - frozenFee,
    coversFee: pot > frozenFee,
  };
}

/** `null` when the Subaccord can host cases; a user-facing reason otherwise. */
export function pluralityGate(aggregation: Aggregation): string | null {
  return aggregation === Aggregation.Plurality
    ? null
    : "This Subaccord tallies by Median — Synod cases need a Plurality court.";
}

/** `now + hours` as unix seconds; `null` on non-positive hours. */
export function deadlineFromHours(nowMs: number, hours: number): bigint | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return BigInt(Math.floor(nowMs / 1000) + Math.round(hours * 3600));
}
