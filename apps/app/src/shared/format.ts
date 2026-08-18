/**
 * format.ts — display helpers for addresses, token amounts, dispute states,
 * hashes, windows, and time.
 *
 * Merged from two sources:
 *  - Dispute feature helpers (DISPUTE_STATE_LABELS, formatRuling, shortAddress)
 *  - Shared scaffold utilities (shortenAddress, formatBigInt, timeRemaining)
 *  - Subaccord view helpers (formatTokenAmount, formatHash, formatWindow)
 */

import type { Address, ReadonlyUint8Array } from "@solana/kit";
import {
  Aggregation,
  DisputeState as DS,
  NO_RULING,
  decodeScalarVote,
} from "@useaccord/sdk";

// --- Dispute state labels + ruling formatting ---

export const DISPUTE_STATE_LABELS: Record<DS, string> = {
  [DS.Created]: "Created",
  [DS.Drawn]: "Drawn",
  [DS.Review]: "Review",
  [DS.Commit]: "Commit",
  [DS.Reveal]: "Reveal",
  [DS.RoundResolved]: "Round resolved",
  [DS.Final]: "Final",
  [DS.Closed]: "Closed",
  [DS.Failed]: "Failed",
  [DS.RedrawEligible]: "Redraw eligible",
};

/**
 * Format a ruling, u64 on the wire (ADR-0025): `Option N` for Plurality,
 * a plain decimal for Median (scalar). Mint decimals aren't fetched in these
 * views, so scalars render at the SDK's canonical 6 decimals — the same
 * default `encodeScalarVote` uses at commit time, so values round-trip.
 */
export function formatRuling(
  ruling: bigint,
  aggregation: Aggregation = Aggregation.Plurality,
): string {
  if (ruling === NO_RULING) return "—";
  if (aggregation === Aggregation.Median) return decodeScalarVote(ruling);
  return `Option ${ruling}`;
}

// --- Address formatting ---

/**
 * Shorten an address with configurable head/tail lengths.
 * Used by dispute + subaccord feature views.
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
 * @param value - raw amount (e.g. lamports, or base units of an SPL token)
 * @param decimals - token decimals (e.g. 9 for SOL, 6 for USDC)
 * @param maxFractionDigits - cap on fractional digits shown (default: decimals)
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
