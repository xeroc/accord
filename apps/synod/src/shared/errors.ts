/**
 * errors.ts — error formatting for user-facing surfaces.
 *
 * {@link describeError} is the single entry point for toasts / inline error
 * text: it pulls a clean reason out of a {@link TransactionSendError}'s program
 * logs (Anchor "Error Code: X. Error Message: Y." → "X: Y") and falls back to
 * {@link unwrapError} for everything else (wallet rejections, SDK errors, …).
 *
 * Mirrors apps/canon/src/shared/errors.ts.
 */
import { TransactionSendError } from "./transaction";

/** Walk `.cause` chain to the root error; return its message. */
export function unwrapError(err: unknown): string {
  let current = err;
  let depth = 0;
  while (
    current instanceof Error &&
    (current as Error & { cause?: unknown }).cause &&
    depth < 10
  ) {
    current = (current as Error & { cause?: unknown }).cause!;
    depth++;
  }
  if (current instanceof Error) return current.message;
  return String(err);
}

// Priority-ordered regexes that pull the human-meaningful reason out of
// on-chain program logs. Anchor's named errors emit "Error Code: Foo. Error
// Number: N. Error Message: bar." — that pair is the nicest to show, so it
// wins.
const PROGRAM_ERROR_PATTERNS: readonly RegExp[] = [
  /Error Code: (\w+)\. Error Number: \d+\. Error Message: (.+)$/,
  /Program log: AnchorError occurred: (.+?)(?:\.|$)/,
  /Program log: Error: (.+?)(?:\.|$)/,
  /Program log: Custom: (.+?)(?:\.|$)/,
  /^Error: (.+?)(?:\.|$)/,
];

/** Pull the most useful reason line out of program execution logs. */
function extractProgramError(logs: readonly string[]): string | null {
  for (const re of PROGRAM_ERROR_PATTERNS) {
    for (const line of logs) {
      const m = line.match(re);
      if (!m) continue;
      const g2 = m[2];
      const text = g2 !== undefined ? `${m[1]}: ${g2}` : m[1];
      if (text !== undefined) {
        const clean = text.replace(/\.$/, "").trim();
        if (clean) return clean;
      }
    }
  }
  // Last resort: the final "Program log:" line (often the failure reason).
  for (let i = logs.length - 1; i >= 0; i--) {
    const line = logs[i];
    if (!line) continue;
    const m = line.match(/Program log: (.+)$/);
    const g1 = m?.[1];
    if (g1 && g1.trim()) return g1.replace(/\.$/, "").trim();
  }
  return null;
}

/**
 * Turn any error into a short, user-facing message. The single helper every
 * toast / inline error in the dApp should go through.
 */
export function describeError(err: unknown): string {
  if (err instanceof TransactionSendError) {
    const extracted = extractProgramError(err.logs);
    if (extracted) return extracted;
    return `Transaction failed: ${String(err.simulationError)}`;
  }
  return unwrapError(err);
}
