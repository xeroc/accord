/**
 * Error mapping for the Accord CLI.
 *
 * On-chain program failures arrive as generic JS errors whose message embeds an
 * Anchor custom code (`Custom program error: #0xNN`, base 6000). This module
 * decodes that code against {@link AccordErrors} so the CLI can emit a stable
 * `{ error, message }` shape (CLI.md §4) and a human hint.
 */
import { AccordErrors, ACCORD_ERROR_CODE_OFFSET, type AccordErrorCode } from "@useaccord/sdk";

export interface CliError {
  exitCode: number;
  /** Stable machine code — an `AccordErrorName` when known, else the raw tag. */
  error: string;
  message: string;
  hint?: string;
}

/** Reverse index: Anchor code → typed {@link AccordErrorCode}. Built once. */
const codeIndex: Record<string, AccordErrorCode> = Object.fromEntries(
  Object.values(AccordErrors).map((e) => [String(e.code), e] as const),
);

/** Find an integer program error code embedded in an error or its message. */
function extractProgramCode(err: unknown): number | null {
  // Kit `SolanaError` / RPC errors often carry a numeric `code` or nested
  // instruction-error context. Walk the error first.
  const fromObj = readCodeFromObject(err);
  if (fromObj !== null) return fromObj;

  const msg = messageOf(err);
  // Anchor/Solana formats: "Custom program error: #0x65" (hex) or "#101" (dec).
  const hexGroup = msg.match(/#0x([0-9a-fA-F]+)/)?.[1];
  if (hexGroup) return parseInt(hexGroup, 16);
  const decGroup = msg.match(/#(\d+)\b/)?.[1];
  if (decGroup) return parseInt(decGroup, 10);
  return null;
}

function readCodeFromObject(err: unknown): number | null {
  // Kit v7 nests the Anchor instruction error as `{ Custom: <code> }` somewhere
  // inside the SolanaError; recurse to find that variant. (We deliberately do
  // NOT match bare numbers — Solana runtime codes like 4615026 would false-match.)
  return findCustomCode(err, 0);
}

function findCustomCode(value: unknown, depth: number): number | null {
  if (depth > 5) return null; // bounded — also breaks circular refs.
  if (!isRecord(value)) return null;
  if ("Custom" in value && typeof value.Custom === "number") return value.Custom;
  for (const v of Object.values(value)) {
    const found = findCustomCode(v, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/** Map any thrown value to a structured CLI error. */
export function toCliError(err: unknown): CliError {
  const code = extractProgramCode(err);
  const known = code !== null ? codeIndex[String(code)] : undefined;

  if (known) {
    return { exitCode: 1, error: known.name, message: known.message };
  }

  const msg = messageOf(err);
  // RPC reachability is common enough to deserve a targeted hint.
  if (/ECONNREFUSED|fetch failed|Failed to fetch|getaddrinfo/i.test(msg)) {
    return {
      exitCode: 1,
      error: "RpcUnreachable",
      message: msg,
      hint: "Is a validator/Surfpool running at the configured --rpc / $ACCORD_RPC_URL?",
    };
  }

  if (code !== null) {
    return {
      exitCode: 1,
      error: `Custom_${code}`,
      message: msg,
      hint: `Program error code ${code} (base ${ACCORD_ERROR_CODE_OFFSET}). Not in the known AccordErrors map.`,
    };
  }

  return { exitCode: 1, error: err instanceof Error ? err.name : "Error", message: msg };
}
