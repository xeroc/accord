/**
 * format.ts — display helpers for addresses, token amounts, hashes, windows.
 *
 * Mirrors apps/app's format.ts, minus Accord dispute-state-specific helpers
 * (those belong to the Accord dApp). Canon-specific formatting is added here
 * as the app grows.
 */

import type { Address, ReadonlyUint8Array } from "@solana/kit";

// --- Address formatting ---

/**
 * Shorten an address with configurable head/tail lengths.
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
 * @param value - raw atomic amount
 * @param decimals - token decimals (e.g. 6 for USDC, 9 for SOL)
 * @param maxFractionDigits - cap on fractional digits (default: all)
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

/**
 * Format an atomic token amount with thousands separators. Used by read-only
 * list views where the mint decimals are unknown — render the raw amount
 * grouped. The detail view can use formatBigInt once mint metadata is fetched.
 */
export function formatTokenAmount(atom: bigint): string {
  return atom.toLocaleString("en-US");
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
