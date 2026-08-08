// fixtures.ts — deterministic-ish builders shared across specs.
// Kept free of chain access so they're usable in any lane (incl. offline).

import { address, type Address } from "@solana/kit";
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

/** Cryptographically random 32 bytes. Unique per call ⇒ unique risk_type/PDA. */
export function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Canonical `create_subaccord` args for tests, from AGENTS.md "v1 Defaults".
 * `risk_type`/`evidence_spec` are freshly random so each run mints a distinct
 * Subaccord PDA (namespace-squat guard requires risk_type ≠ 0). Override any
 * field via `overrides`.
 */
export function defaultSubaccordArgs(
  stakingToken: Address,
  feeToken: Address,
  evidenceOperator: Address,
  overrides: Partial<CreateSubaccordArgs> = {},
): CreateSubaccordArgs {
  return {
    riskType: randomBytes32(),
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
    aggregation: Aggregation.Plurality,
    feePerJuror: 0n,
    revealThresholdBps: 6_666, // 2/3 (ADR-0021)
    shortfallPolicy: ShortfallPolicy.Redraw, // ADR-0021
    maxDrawAttempts: 3, // ADR-0021
    authority: DEFAULT_PUBKEY, // immutable
    evidenceOperator,
    depth: 4, // small for tests (2^4 = 16 seats max)
    ...overrides,
  };
}
