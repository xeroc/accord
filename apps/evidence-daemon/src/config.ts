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
