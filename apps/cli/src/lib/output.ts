/**
 * Output rendering for the three modes (CLI.md §4 "Output contract"):
 *   - `--json`  → exactly one JSON value on stdout
 *   - `--quiet` → only the signature (send) or address (create/read)
 *   - default   → human: `✓ confirmed`, tables, truncated addresses
 *
 * Renderers are pure (return a string); the command emits the result. This keeps
 * them unit-testable and lets a command reuse the same renderer for `--out`.
 */
import { groupBigInt, truncateAddress } from "./format.js";

export interface OutputFlags {
  json?: boolean;
  quiet?: boolean;
}

export type Extra = Record<string, unknown>;

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * JSON.stringify that survives BigInt (Kit returns lamports/amounts as bigint).
 * Bigints serialize as decimal strings — lossless and jq-friendly.
 */
export function jsonStringify(value: unknown, indent = 2): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v), indent);
}

/** Render a send result: `{ signature, ...extra }` / sig only / human line. */
export function renderSend(flags: OutputFlags, signature: string, extra: Extra = {}): string {
  if (flags.quiet) return signature;
  if (flags.json) return jsonStringify({ signature, ...extra }, 0);
  const lines = [`✓ confirmed: ${signature}`];
  for (const [key, value] of Object.entries(extra)) {
    lines.push(`  ${key}: ${humanValue(value)}`);
  }
  return lines.join("\n");
}

/** Render a create result: `{ address, ...extra }` / address only / human block. */
export function renderCreated(flags: OutputFlags, address: string, extra: Extra = {}): string {
  if (flags.quiet) return address;
  if (flags.json) return jsonStringify({ address, ...extra }, 0);
  const lines = [`address : ${address}`];
  for (const [key, value] of Object.entries(extra)) {
    lines.push(`${key.padEnd(9)}: ${humanValue(value)}`);
  }
  return lines.join("\n");
}

export interface ReadOptions {
  /** Value printed under `--quiet` (usually the account address or null). */
  primary?: string;
  /** Pre-formatted human lines (default mode). Omitted ⇒ JSON pretty-print. */
  human?: string[];
}

/** Render a read result: the decoded account / a primary / human lines. */
export function renderRead(flags: OutputFlags, data: unknown, opts: ReadOptions = {}): string {
  if (flags.quiet) return opts.primary ?? "";
  if (flags.json) return jsonStringify(data);
  if (opts.human && opts.human.length > 0) return opts.human.join("\n");
  return jsonStringify(data);
}

/** Coerce an `extra`/human value to a display string (bigint grouping, addr trunc). */
function humanValue(value: unknown): string {
  if (typeof value === "bigint") return groupBigInt(value);
  if (typeof value === "string" && ADDRESS_RE.test(value)) return truncateAddress(value);
  if (value === null || value === undefined) return "—";
  return String(value);
}
