/**
 * format.ts — display helpers for addresses, token amounts, item states, time.
 *
 * Canon-specific: {@link ITEM_STATE_LABELS} maps the five CanonItem lifecycle
 * stages (SPEC §Item state machine) to human labels. The address/time/amount
 * helpers mirror apps/app/src/shared/format.ts.
 */

import type { Address } from "@solana/kit";
import { ItemState } from "@useaccord/canon";

// --- Item state labels (SPEC §Item state machine) ---

export const ITEM_STATE_LABELS: Record<ItemState, string> = {
  [ItemState.Pending]: "Pending",
  [ItemState.Listed]: "Listed",
  [ItemState.Removed]: "Removed",
  [ItemState.WithdrawPending]: "Withdraw pending",
  [ItemState.Disputed]: "Disputed",
};

// --- Address formatting ---

/** Shorten an address: `So111…1111` style (configurable head/tail). */
export function shortAddress(
  addr: Address | string,
  head = 4,
  tail = 4,
): string {
  const s = String(addr);
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Compact address for the Navbar wallet display. */
export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

// --- Token amount formatting ---

/**
 * Format an atomic token amount with thousands separators. Used by read-only
 * views where the mint decimals are unknown — render the raw amount grouped.
 */
export function formatTokenAmount(atom: bigint): string {
  return atom.toLocaleString("en-US");
}

// --- Window formatting ---

/** Render a window length (seconds) as a humanised "Nd / Nh / Nm" string. */
export function formatWindow(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 86_400 && s % 86_400 === 0) return `${s / 86_400}d`;
  if (s >= 3_600 && s % 3_600 === 0) return `${s / 3_600}h`;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

// --- Time formatting ---

/**
 * Human-readable countdown from now to a deadline.
 *
 * @param deadlineSec - unix deadline in SECONDS (Solana Clock unix_timestamp)
 * @param nowSec - current unix time in seconds (default: Date.now()/1000)
 * @returns e.g. "2d 3h", "45m", "expired", or "" if deadline is null/0
 */
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
