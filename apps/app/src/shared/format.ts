/**
 * format.ts — pure display helpers for addresses, token amounts, and time.
 *
 * No Solana types — these are presentation-layer utilities, safe to unit-test
 * in isolation.
 */

/**
 * Shorten an address for compact display: `So111...1111` style.
 *
 * @param addr - full base58 address string
 * @param chars - leading/trailing chars to keep (default 4)
 */
export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

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
