/**
 * format.ts — display helpers for the Synod dApp (canon-shaped subset).
 *
 * Pure functions (no RPC, no React). Dispute helpers mirror apps/canon +
 * apps/app and back the inline dispute card.
 */

import { DisputeState } from "@useaccord/sdk";

/** Truncate a base58 address to `So11…1112` form. Too-short input passes through. */
export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Format a u64 base-unit amount with thousands separators (no decimals —
 * Synod stakes/fees are whole base units in the form). */
export function formatAmount(units: bigint): string {
  return units.toLocaleString("en-US");
}

// --- Dispute state labels + ruling formatting (mirrors apps/canon) ---

export const DISPUTE_STATE_LABELS: Record<DisputeState, string> = {
  [DisputeState.Created]: "Created",
  [DisputeState.Drawn]: "Drawn",
  [DisputeState.Review]: "Review",
  [DisputeState.Commit]: "Commit",
  [DisputeState.Reveal]: "Reveal",
  [DisputeState.RoundResolved]: "Round resolved",
  [DisputeState.Final]: "Final",
  [DisputeState.Closed]: "Closed",
  [DisputeState.Failed]: "Failed",
  [DisputeState.RedrawEligible]: "Redraw eligible",
};

/** Ruling sentinel — `finalRuling` is u64::MAX until the dispute is final (ADR-0025). */
const NO_RULING = 0xffff_ffff_ffff_ffffn;

/** Render a Dispute `finalRuling` index, or "—" when not yet decided. */
export function formatRuling(ruling: bigint, optionLabels?: string[]): string {
  if (ruling === NO_RULING) return "—";
  const idx = Number(ruling);
  return optionLabels?.[idx] ?? `Option ${idx}`;
}

/** Unix-seconds (Clock unix_time, possibly bigint) → locale string. */
export function formatTimestamp(
  unixSec: bigint | number | null | undefined,
): string {
  if (unixSec === null || unixSec === undefined) return "—";
  const n = Number(unixSec);
  if (n === 0) return "—";
  return new Date(n * 1000).toLocaleString();
}
