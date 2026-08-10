/**
 * Pure presentation formatters shared by every command's output + dry-run
 * renderer. No I/O, no chain — deterministic and unit-testable.
 *
 * Conventions (CLI.md §4 "Output contract"):
 *   - addresses truncated `cordh…yKed`
 *   - bigints grouped with underscores `1_000_000`
 *   - unix-seconds timestamps rendered ISO
 */
import { AccountRole } from "@solana/kit";

/** `cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed` → `cordh…yKed`. */
export function truncateAddress(addr: string, head = 5, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** `1000000n` → `1_000_000`. Sign-aware; balances are non-negative in practice. */
export function groupBigInt(value: bigint | number): string {
  const negative = value < 0;
  const digits = String(negative ? -value : value);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  return negative ? `-${grouped}` : grouped;
}

/** Unix seconds (on-chain clocks) → ISO-8601 UTC. `null`-safe. */
export function isoFromUnixSeconds(seconds: number | bigint | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

/**
 * Render a Kit `AccountRole` as a human signer/writable label for the dry-run
 * instruction dump. Kit encodes role as two bits: signer (0b10), writable (0b01).
 */
export function accountRoleLabel(role: AccountRole): string {
  const signer = (role & AccountRole.READONLY_SIGNER) !== 0; // 0b10
  const writable = (role & AccountRole.WRITABLE) !== 0; // 0b01
  return [writable ? "writable" : "readonly", signer ? "signer" : undefined]
    .filter(Boolean)
    .join(" ");
}
