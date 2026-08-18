/**
 * format.ts — display helpers for the Synod dApp (canon-shaped subset).
 *
 * Pure functions (no RPC, no React).
 */

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
