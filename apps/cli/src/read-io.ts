/**
 * Shared helpers for the `read:*` topic — `--out` flag, JSON serialization
 * that survives the Kit types (bigint → decimal string, Uint8Array → 0x-hex,
 * Option<T> → T | null), and a generic human renderer for decoded accounts.
 *
 * Lives inside the read topic dir (NOT `src/lib`) so it ships with the topic
 * and never touches shared infra. oclif skips this file — it exports no
 * Command subclass.
 */
import { writeFileSync } from "node:fs";

import { Flags } from "@oclif/core";
import { isNone, isOption, isSome } from "@solana/kit";

import { groupBigInt, isoFromUnixSeconds, truncateAddress } from "./lib/format.js";

/** `--out <file>` — writes the JSON payload to <file> (for piping). */
export const outFlag = Flags.string({
  description: "Write the JSON payload to <file> (for piping)",
  char: "o",
});

export interface ReadOutFlags {
  out?: string;
}

/**
 * Bound shape of {@link BaseCommand.emitRead}; passed in so the helpers here
 * (outside the class hierarchy) can drive output without touching `protected`.
 */
export type EmitRead = (data: unknown, opts?: { primary?: string; human?: string[] }) => void;

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Field names whose bigint value is a Unix-seconds timestamp (→ ISO label). */
const TS_FIELD_RE = /(End|At)$/;

// --- serialization ----------------------------------------------------------

/** JSON-safe transform: bigint → decimal string, Uint8Array → 0x-hex, Option → value|null. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) return toHex(value);
  if (isOption(value) && isSome(value)) return jsonSafe(value.value);
  if (isOption(value) && isNone(value)) return null;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

/** Stable JSON for any decoded payload (jq-friendly; 2-space pretty under --json). */
export function serialize(value: unknown, indent = 2): string {
  return JSON.stringify(jsonSafe(value), null, indent);
}

/** `--out` writer: serialize the payload + trailing newline. */
export function writeOut(path: string, value: unknown): void {
  writeFileSync(path, serialize(value) + "\n");
}

// --- human rendering --------------------------------------------------------

/**
 * One line per top-level field (skips `discriminator` + `pad*` padding).
 * Addresses truncated, bigints grouped, Unix-second fields ISO-labeled,
 * bytes as `0x…` hex, arrays summarised by length.
 */
export function summarizeFields(
  data: Record<string, unknown> | null | undefined,
  indent = "  ",
): string[] {
  if (!data) return [];
  const lines: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === "discriminator" || /^pad\w*$/.test(key)) continue;
    lines.push(`${indent}${key.padEnd(18)}: ${humanField(key, val)}`);
  }
  return lines;
}

/** Render a decoded Account<T> (or "not found") uniformly across read:* commands. */
export function emitAccountRead<T extends object>(
  emit: EmitRead,
  flags: ReadOutFlags,
  maybe: { exists: true; address: string; data: T } | { exists: false; address: string },
  label: string,
): void {
  const address = maybe.address;
  if (maybe.exists) {
    const payload = { address, exists: true, ...(maybe.data as Record<string, unknown>) };
    if (flags.out) writeOut(flags.out, payload);
    emit(payload, {
      primary: address,
      human: [
        `${label.padEnd(18)}: ${truncateAddress(address)}`,
        ...summarizeFields(maybe.data as Record<string, unknown>),
      ],
    });
  } else {
    const payload = { address, exists: false };
    if (flags.out) writeOut(flags.out, payload);
    emit(payload, {
      primary: "",
      human: [`${label.padEnd(18)}: ${truncateAddress(address)}  (not found)`],
    });
  }
}

/** Render a list query result (`Account<T>[]`). Human = numbered addresses + a one-line summary. */
export function emitListRead<T extends object>(
  emit: EmitRead,
  flags: ReadOutFlags,
  accounts: Array<{ address: string; data: T }>,
  label: string,
): void {
  const payload = accounts.map((a) => ({
    address: a.address,
    ...(a.data as Record<string, unknown>),
  }));
  if (flags.out) writeOut(flags.out, payload);
  emit(payload, {
    primary: `${accounts.length}`,
    human:
      accounts.length === 0
        ? [`${label}: none`]
        : [
            `${label}: ${accounts.length}`,
            ...accounts.map(
              (a, i) =>
                `  [${i}] ${truncateAddress(a.address)}  ${firstLineSummary(a.data as Record<string, unknown>)}`,
            ),
          ],
  });
}

/** First distinguishing field for a list row (subaccord/juror/state…), single line. */
function firstLineSummary(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === "discriminator" || /^pad\w*$/.test(key)) continue;
    if (parts.length >= 3) break;
    parts.push(`${key}=${humanField(key, val)}`);
  }
  return parts.join("  ");
}

// --- internals --------------------------------------------------------------

function humanField(key: string, value: unknown): string {
  if (isOption(value) && isSome(value)) return humanField(key, value.value);
  if (isOption(value) && isNone(value)) return "none";
  if (value instanceof Uint8Array) return `${truncateHex(toHex(value))} (${value.byteLength}B)`;
  if (typeof value === "bigint") {
    if (TS_FIELD_RE.test(key)) {
      const iso = isoFromUnixSeconds(value);
      return `${groupBigInt(value)}${iso ? `  (${iso})` : ""}`;
    }
    return groupBigInt(value);
  }
  if (typeof value === "string") return ADDRESS_RE.test(value) ? truncateAddress(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const head = value[0];
    if (head instanceof Uint8Array) return `[${value.length} × ${head.byteLength}B]`;
    if (typeof head === "string" && ADDRESS_RE.test(head)) {
      return `[${value.length}] ${value
        .slice(0, 4)
        .map((a) => truncateAddress(a))
        .join(", ")}${value.length > 4 ? ", …" : ""}`;
    }
    if (typeof head === "bigint") {
      return `[${value.length}] ${value
        .slice(0, 4)
        .map((b) => groupBigInt(b))
        .join(", ")}${value.length > 4 ? ", …" : ""}`;
    }
    return `[${value.length}]`;
  }
  if (value && typeof value === "object") {
    // nested struct (terms / proposed / Aggregation …) — compact one-line preview
    const preview = serialize(value, 0).replace(/\s+/g, " ").slice(0, 140);
    return preview;
  }
  if (value === null || value === undefined) return "—";
  return String(value);
}

function toHex(b: Uint8Array): string {
  return (
    "0x" +
    Array.from(b)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

function truncateHex(hex: string, head = 10, tail = 8): string {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
