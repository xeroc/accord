/**
 * errors.ts — error unwrapping for wallet/SDK errors.
 *
 * ConnectorKit wraps the wallet's actual error in a `TransactionError` with a
 * generic message ("Failed to sign transaction 1 of 1") and buries the real
 * cause in `.cause`. This walks the chain to surface the root message.
 */

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
  return String(current);
}
