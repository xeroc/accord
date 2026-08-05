/**
 * /healthz probe (ADR-0011 §HA, bean accord-u1pu). Pings Storage + RPC in
 * parallel with a per-check timeout; ok iff both reachable. The LB drains on
 * the resulting 503.
 *
 * SEAM: the concrete `storage` and `rpc` pings are injected — the real ones
 * land with the S3 store (bean accord-udiu: HEAD bucket) and the chain reader
 * (bean accord-h1v2: RPC getHealth). `main.ts` wires stubs until then.
 */
import type { HealthProbe } from "./handlers.js";

export interface HealthChecks {
  /** HEAD the S3/MinIO bucket (or any store reachability ping). */
  readonly storage: () => Promise<boolean>;
  /** RPC reachability (e.g. an `getHealth`/version call). */
  readonly rpc: () => Promise<boolean>;
  /** Per-check timeout in ms; a timed-out check counts as unreachable. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<T | "timeout"> {
  return Promise.race([
    p,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ms),
    ),
  ]);
}

async function reach(
  name: string,
  check: () => Promise<boolean>,
  ms: number,
): Promise<string | null> {
  try {
    const r = await withTimeout(check(), ms);
    return r === true ? null : `${name} unreachable`;
  } catch (e) {
    return `${name} error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function createHealthProbe(checks: HealthChecks): HealthProbe {
  const ms = checks.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async () => {
    const [storageErr, rpcErr] = await Promise.all([
      reach("storage", checks.storage, ms),
      reach("rpc", checks.rpc, ms),
    ]);
    const problems = [storageErr, rpcErr].filter(
      (x): x is string => x !== null,
    );
    if (problems.length === 0) return { ok: true };
    return { ok: false, detail: problems.join("; ") };
  };
}
