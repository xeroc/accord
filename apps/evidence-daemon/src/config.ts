/**
 * Minimal env config for the HTTP layer.
 *
 * SEAM (bean accord-11im): the full config + EnvKeyring parsing lands there.
 * This file holds only what the server needs to boot; accord-11im extends it
 * with keyring, S3, program-id, and RPC settings.
 */
export interface ServerConfig {
  readonly port: number;
  readonly tls: { readonly certPath?: string; readonly keyPath?: string };
  /** Per-IP requests/min. 0 disables. */
  readonly rateLimitPerMin: number;
  /** Request body cap in bytes. 0 = no cap. */
  readonly maxEvidenceBytes: number;
  /** Accounting-only X-Account-Key (never denies). */
  readonly accountKeyEnabled: boolean;
  /** Per-backend (storage/rpc) health-check timeout in ms. */
  readonly healthTimeoutMs: number;
}

function num(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const v = env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function str(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const v = env[key];
  return v === "" ? undefined : v;
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const certPath = str(env, "EVIDENCE_TLS_CERT");
  const keyPath = str(env, "EVIDENCE_TLS_KEY");
  return {
    port: num(env, "EVIDENCE_PORT", 443),
    tls:
      certPath !== undefined && keyPath !== undefined
        ? { certPath, keyPath }
        : {},
    rateLimitPerMin: num(env, "EVIDENCE_RATE_LIMIT_PER_MIN", 0),
    maxEvidenceBytes: num(env, "EVIDENCE_MAX_EVIDENCE_BYTES", 0),
    accountKeyEnabled:
      (env.EVIDENCE_ACCOUNT_KEY_ENABLED ?? "").toLowerCase() === "true",
    healthTimeoutMs: num(env, "EVIDENCE_HEALTH_TIMEOUT_MS", 2000),
  };
}
