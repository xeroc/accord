/**
 * Twelve-factor env parsing (RPC, program id, keyring, S3, port, limits).
 * No secrets are logged here; values are only surfaced to the caller for wiring.
 * See SPEC §Configuration for the full variable list.
 */

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

export interface Config {
  rpcUrl: string;
  programId: string;
  /** Raw `EVIDENCE_KEYRING` value; {@link EnvKeyring} parses + validates it. */
  keyring: string;
  s3: S3Config;
  port: number;
  rateLimitPerMin?: number;
  maxEvidenceBytes?: number;
  retentionDays?: number;
  /** Present only when both TLS halves are configured. */
  tls?: { cert: string; key: string };
}

/**
 * Read + validate the daemon env. Throws on any missing required var or
 * malformed integer. `env` parameter defaults to `process.env` so callers
 * (and tests) can inject a deterministic environment.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const rpcUrl = required(env, "EVIDENCE_RPC_URL");
  const programId = required(env, "EVIDENCE_PROGRAM_ID");
  const keyring = required(env, "EVIDENCE_KEYRING");
  if (keyring.trim().length === 0) {
    throw new Error("EVIDENCE_KEYRING must list at least one base58 Ed25519 secret");
  }

  const endpoint = required(env, "EVIDENCE_S3_ENDPOINT");
  const bucket = required(env, "EVIDENCE_S3_BUCKET");
  const region = required(env, "EVIDENCE_S3_REGION");

  const accessKeyId = env.EVIDENCE_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.EVIDENCE_S3_SECRET_ACCESS_KEY;
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new Error(
      "EVIDENCE_S3_ACCESS_KEY_ID and EVIDENCE_S3_SECRET_ACCESS_KEY must be set together",
    );
  }

  const tlsCert = env.EVIDENCE_TLS_CERT;
  const tlsKey = env.EVIDENCE_TLS_KEY;
  if ((tlsCert === undefined) !== (tlsKey === undefined)) {
    throw new Error("EVIDENCE_TLS_CERT and EVIDENCE_TLS_KEY must be set together");
  }

  return {
    rpcUrl,
    programId,
    keyring,
    s3: {
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: boolFlag(env.EVIDENCE_S3_FORCE_PATH_STYLE),
    },
    port: intFlag(env.EVIDENCE_PORT, 443, "EVIDENCE_PORT"),
    rateLimitPerMin: optionalInt(env.EVIDENCE_RATE_LIMIT_PER_MIN, "EVIDENCE_RATE_LIMIT_PER_MIN"),
    maxEvidenceBytes: optionalInt(env.EVIDENCE_MAX_EVIDENCE_BYTES, "EVIDENCE_MAX_EVIDENCE_BYTES"),
    retentionDays: optionalInt(env.EVIDENCE_RETENTION_DAYS, "EVIDENCE_RETENTION_DAYS"),
    tls: tlsCert !== undefined && tlsKey !== undefined ? { cert: tlsCert, key: tlsKey } : undefined,
  };
}

function required(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function boolFlag(v: string | undefined): boolean {
  return v !== undefined && /^(1|true|yes)$/i.test(v.trim());
}

function intFlag(v: string | undefined, def: number, name: string): number {
  if (v === undefined || v.trim().length === 0) return def;
  return parseNonNegInt(v, name);
}

function optionalInt(v: string | undefined, name: string): number | undefined {
  if (v === undefined || v.trim().length === 0) return undefined;
  return parseNonNegInt(v, name);
}

function parseNonNegInt(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${JSON.stringify(v)}`);
  }
  return n;
}

/**
 * HTTP-layer config subset. The full env (keyring, S3, program-id, RPC) is
 * parsed by {@link loadConfig} above; this is the smaller view the server
 * needs to boot.
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

function num(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function str(env: Record<string, string | undefined>, key: string): string | undefined {
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
    tls: certPath !== undefined && keyPath !== undefined ? { certPath, keyPath } : {},
    rateLimitPerMin: num(env, "EVIDENCE_RATE_LIMIT_PER_MIN", 0),
    maxEvidenceBytes: num(env, "EVIDENCE_MAX_EVIDENCE_BYTES", 0),
    accountKeyEnabled: (env.EVIDENCE_ACCOUNT_KEY_ENABLED ?? "").toLowerCase() === "true",
    healthTimeoutMs: num(env, "EVIDENCE_HEALTH_TIMEOUT_MS", 2000),
  };
}
