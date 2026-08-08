/**
 * Display formatting helpers — IBM Plex Mono is applied via the `mono` class
 * in index.css; these convert on-chain values to short human strings.
 */
import type { Address } from "@solana/kit";

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
