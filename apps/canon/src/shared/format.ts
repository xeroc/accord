/**
 * format.ts — display helpers for addresses, token amounts, item states,
 * bps, windows, and time.
 *
 * Mirrors apps/app/src/shared/format.ts. Canon-specific additions:
 * `ITEM_STATE_LABELS` (the Canon item lifecycle enum) and `formatBps`.
 */

import type { Address, ReadonlyUint8Array } from "@solana/kit";
import { ItemState } from "@useaccord/canon";

// --- Item state labels ---

export const ITEM_STATE_LABELS: Record<ItemState, string> = {
  [ItemState.Pending]: "Pending",
  [ItemState.Listed]: "Listed",
  [ItemState.Removed]: "Removed",
  [ItemState.WithdrawPending]: "Withdraw pending",
  [ItemState.Disputed]: "Disputed",
};

// --- Address formatting ---

/**
 * Shorten an address with configurable head/tail lengths.
 * Used by list + item detail views.
 */
export function shortAddress(
  addr: Address | string,
  head = 4,
  tail = 4,
): string {
  const s = String(addr);
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Shorten an address for compact display: `So111…1111` style.
 * Used by the Navbar wallet display.
 */
export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

// --- Token amount formatting ---

/**
 * Format a raw bigint token amount into a human-readable decimal string.
 *
 * @param value - atomic amount (e.g. 1_000_000 for 1 USDC at 6 decimals)
 * @param decimals - token decimals (e.g. 6 for USDC)
 * @param maxFractionDigits - max digits after the decimal point (default: all)
 */
export function formatBigInt(
  value: bigint,
  decimals: number,
  maxFractionDigits?: number,
): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;

  const fracDigits = maxFractionDigits ?? decimals;
  if (fracDigits === 0 || fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  let fracStr = fraction.toString().padStart(decimals, "0");
  if (fracDigits < decimals) {
    fracStr = fracStr.slice(0, fracDigits).replace(/0+$/, "");
  }
  return fracStr
    ? `${negative ? "-" : ""}${whole.toString()}.${fracStr}`
    : `${negative ? "-" : ""}${whole.toString()}`;
}

// --- Hash formatting ---

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

// --- Bps formatting ---

/**
 * Format a basis-points value as a human-readable percentage.
 *
 * 6666 bps → "66.66%", 100 bps → "1%", 50 bps → "0.5%".
 *
 * @param bps - basis points (0–10000; 10000 = 100%)
 * @param maxFractionDigits - max digits after the decimal point (default: 2)
 */
export function formatBps(bps: number, maxFractionDigits = 2): string {
  const pct = bps / 100;
  return `${pct.toFixed(maxFractionDigits).replace(/\.?0+$/, "")}%`;
}
