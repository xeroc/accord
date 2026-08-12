export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  /** Server-side encryption: unset (no SSE header), "AES256" (SSE-S3), "aws:kms". */
  readonly serverSideEncryption?: "AES256" | "aws:kms";
  /** KMS key id when serverSideEncryption is "aws:kms". */
  readonly kmsKeyId?: string;
}

export interface FsConfig {
  /** Directory holding evidence files (created lazily on first put). */
  rootDir: string;
}

/**
 * Discriminated storage configuration. Selected by `EVIDENCE_STORAGE`
 * (default `s3`). Only the selected backend's env vars are required, so a
 * filesystem deployment never needs S3 credentials (and vice versa).
 */
export type StorageConfig =
  { readonly kind: "s3"; readonly s3: S3Config } | { readonly kind: "fs"; readonly fs: FsConfig };

export interface Config {
  rpcUrl: string;
  programId: string;
  /** Raw `EVIDENCE_KEYRING` value; {@link EnvKeyring} parses + validates it. */
  keyring: string;
  /** Selected ciphertext backend (S3 default; local FS when EVIDENCE_STORAGE=fs). */
  storage: StorageConfig;
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

  const storage = parseStorage(env);

  const tlsCert = env.EVIDENCE_TLS_CERT;
  const tlsKey = env.EVIDENCE_TLS_KEY;
  if ((tlsCert === undefined) !== (tlsKey === undefined)) {
    throw new Error("EVIDENCE_TLS_CERT and EVIDENCE_TLS_KEY must be set together");
  }

  return {
    rpcUrl,
    programId,
    keyring,
    storage,
    port: intFlag(env.EVIDENCE_PORT, 443, "EVIDENCE_PORT"),
    rateLimitPerMin: optionalInt(env.EVIDENCE_RATE_LIMIT_PER_MIN, "EVIDENCE_RATE_LIMIT_PER_MIN"),
    maxEvidenceBytes: optionalInt(env.EVIDENCE_MAX_EVIDENCE_BYTES, "EVIDENCE_MAX_EVIDENCE_BYTES"),
    retentionDays: optionalInt(env.EVIDENCE_RETENTION_DAYS, "EVIDENCE_RETENTION_DAYS"),
    tls: tlsCert !== undefined && tlsKey !== undefined ? { cert: tlsCert, key: tlsKey } : undefined,
  };
}

/**
 * Parse the selected storage backend. `EVIDENCE_STORAGE` selects `s3`
 * (default) or `fs`; only the selected backend's vars are required. Throws
 * on an unknown backend or a missing required var for the selected one.
 */
function parseStorage(env: Record<string, string | undefined>): StorageConfig {
  const backend = (env.EVIDENCE_STORAGE ?? "s3").trim().toLowerCase();
  if (backend === "fs") {
    return { kind: "fs", fs: { rootDir: required(env, "EVIDENCE_FS_ROOT_DIR") } };
  }
  if (backend !== "s3") {
    throw new Error(`EVIDENCE_STORAGE must be "s3" or "fs", got: ${JSON.stringify(backend)}`);
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

  const sse = env.EVIDENCE_S3_SSE?.trim() || undefined;
  if (sse !== undefined && sse !== "AES256" && sse !== "aws:kms") {
    throw new Error(`EVIDENCE_S3_SSE must be "AES256" or "aws:kms", got: ${JSON.stringify(sse)}`);
  }
  const kmsKeyId = env.EVIDENCE_S3_KMS_KEY_ID; // gitleaks:allow — env var read, not a hardcoded secret
  if (sse === "aws:kms" && !kmsKeyId) {
    throw new Error("EVIDENCE_S3_KMS_KEY_ID is required when EVIDENCE_S3_SSE=aws:kms");
  }

  return {
    kind: "s3",
    s3: {
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: boolFlag(env.EVIDENCE_S3_FORCE_PATH_STYLE),
      serverSideEncryption: sse,
      kmsKeyId,
    },
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
  /**
   * Honor X-Forwarded-For for per-IP rate limiting. Must be true only behind a
   * trusted LB/Ingress that overwrites XFF; false (default) ignores it so a
   * direct client cannot spoof the header to evade the limiter.
   */
  readonly trustProxy: boolean;
  /** Per-backend (storage/rpc) health-check timeout in ms. */
  readonly healthTimeoutMs: number;
  /** CORS Access-Control-Allow-Origin value. Defaults to "*" (allow all). */
  readonly corsOrigin: string;
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
    trustProxy: (env.EVIDENCE_TRUST_PROXY ?? "").toLowerCase() === "true",
    healthTimeoutMs: num(env, "EVIDENCE_HEALTH_TIMEOUT_MS", 2000),
    corsOrigin: env.EVIDENCE_CORS_ORIGIN ?? "*",
  };
}
