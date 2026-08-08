/**
 * Display formatting helpers — IBM Plex Mono is applied via the `mono` class
 * in index.css; these convert on-chain values to short human strings.
 */
import type { Address, ReadonlyUint8Array } from "@solana/kit";

/** Shorten `TokenkegQfeZ…VQ5DA` → `TokenkegQfeZ…VQ5DA` (first 10 / last 5). */
export function shortAddress(addr: Address | string): string {
  const s = String(addr);
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-5)}`;
}

/** Lamports (1e-9 SOL) is wrong here — stake is a token amount with its own
 * decimals. We don't know the mint decimals on a read-only list, so render the
 * raw atomic amount grouped by thousands. The detail view can format once the
 * mint metadata is fetched. */
export function formatTokenAmount(atom: bigint): string {
  return atom.toLocaleString("en-US");
}

/** 32-byte hash → lowercase hex (64 chars), optionally truncated to first 8 /
 * last 6 chars for compact display (full value in the `title` attribute). */
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

/** Render a window length (seconds) as a humanised "Nd / Nh / Nm" string. */
export function formatWindow(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 86_400 && s % 86_400 === 0) return `${s / 86_400}d`;
  if (s >= 3_600 && s % 3_600 === 0) return `${s / 3_600}h`;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}
