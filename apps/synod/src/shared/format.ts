/**
 * format.ts — display helpers for the Synod dApp (canon-shaped subset).
 *
 * Pure functions (no RPC, no React). Dispute helpers mirror apps/canon +
 * apps/app and back the inline dispute card.
 */

import { type ReadonlyUint8Array } from "@solana/kit";
import { DisputeState } from "@useaccord/sdk";

/** Truncate a base58 address to `So11…1112` form. Too-short input passes through. */
export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Shorten with explicit head/tail lengths (list/detail rows). */
export function shortAddress(
  addr: string,
  head = 4,
  tail = 4,
): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
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

// --- Hash formatting (evidence slots; mirrors apps/canon) ---

/** 32-byte hash → lowercase hex (64 chars), optionally truncated for compact
 * display (full value in the `title` attribute). */
export function formatHash(
  bytes: Uint8Array | ReadonlyUint8Array,
  truncate = true,
): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  if (truncate && hex.length > 20) {
    return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
  }
  return hex;
}

// --- Window formatting (join deadlines; mirrors apps/canon) ---

/** Render a window length (seconds) as a humanised "Nd / Nh / Nm" string. */
export function formatWindow(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 86_400 && s % 86_400 === 0) return `${s / 86_400}d`;
  if (s >= 3_600 && s % 3_600 === 0) return `${s / 3_600}h`;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

// --- Time formatting (mirrors apps/canon) ---

/** Countdown to a unix-seconds deadline: "2d 3h" / "45m" / "expired" / "". */
export function timeRemaining(
  deadlineSec: number | null | undefined,
  nowSec?: number,
): string {
  if (!deadlineSec) return "";
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const remaining = deadlineSec - now;
  if (remaining <= 0) return "expired";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Elapsed time since a unix-seconds timestamp: "3d ago" / "just now" / "". */
export function timeAgo(
  unixSec: bigint | number | null | undefined,
  nowSec?: number,
): string {
  if (unixSec === null || unixSec === undefined) return "";
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const elapsed = now - Number(unixSec);
  if (elapsed < 60) return "just now";

  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
}
