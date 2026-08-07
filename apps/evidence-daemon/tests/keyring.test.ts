import { test, expect } from "bun:test";
import { ed25519PublicKeyFromSeed } from "@accord/sdk/evidence";
import bs58 from "bs58";
import { EnvKeyring } from "../src/keys/keyring";
import { loadConfig } from "../src/config";

const b58 = (b: Uint8Array): string => bs58.encode(b);

test("EnvKeyring: one valid seed resolves via its derived pubkey", async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const pub = ed25519PublicKeyFromSeed(seed);
  const kr = EnvKeyring.fromEnv(b58(seed));
  expect(kr.size).toBe(1);
  const kp = await kr.forOperator(pub);
  expect(kp).not.toBeNull();
  expect([...kp!.publicKey]).toEqual([...pub]);
  expect([...kp!.secretKey]).toEqual([...seed]);
});

test("EnvKeyring: comma-separated list with whitespace parses all entries", async () => {
  const s1 = crypto.getRandomValues(new Uint8Array(32));
  const s2 = crypto.getRandomValues(new Uint8Array(32));
  const s3 = crypto.getRandomValues(new Uint8Array(32));
  const kr = EnvKeyring.fromEnv(`${b58(s1)} , ${b58(s2)},\t${b58(s3)}`);
  expect(kr.size).toBe(3);
  for (const seed of [s1, s2, s3]) {
    expect(await kr.forOperator(ed25519PublicKeyFromSeed(seed))).not.toBeNull();
  }
});

test("EnvKeyring: empty entries are ignored (trailing comma / blanks)", () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const kr = EnvKeyring.fromEnv(`  ${b58(seed)} , ,  `);
  expect(kr.size).toBe(1);
});

test("EnvKeyring: unknown pubkey resolves to null", async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const kr = EnvKeyring.fromEnv(b58(seed));
  const other = ed25519PublicKeyFromSeed(crypto.getRandomValues(new Uint8Array(32)));
  expect(await kr.forOperator(other)).toBeNull();
});

test("EnvKeyring: non-32-byte operator input resolves to null", async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const kr = EnvKeyring.fromEnv(b58(seed));
  expect(await kr.forOperator(new Uint8Array(31))).toBeNull();
  expect(await kr.forOperator(new Uint8Array(33))).toBeNull();
});

test("EnvKeyring: deterministic — same seed yields same pubkey across instances", async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const pubA = await EnvKeyring.fromEnv(b58(seed)).forOperator(ed25519PublicKeyFromSeed(seed));
  const pubB = await EnvKeyring.fromEnv(b58(seed)).forOperator(ed25519PublicKeyFromSeed(seed));
  expect(pubA).not.toBeNull();
  expect(pubB).not.toBeNull();
  expect([...pubA!.publicKey]).toEqual([...pubB!.publicKey]);
});

test("EnvKeyring: fixed all-zero seed anchors to its known pubkey", async () => {
  const zeros = new Uint8Array(32);
  const pub = ed25519PublicKeyFromSeed(zeros);
  expect(b58(pub)).toBe("4zvwRjXUKGfvwnParsHAS3HuSVzV5cA4McphgmoCtajS");
  const kr = EnvKeyring.fromEnv(b58(zeros));
  expect(kr.size).toBe(1);
  expect(await kr.forOperator(pub)).not.toBeNull();
});

test("EnvKeyring: rejects non-base58 input", () => {
  expect(() => EnvKeyring.fromEnv("NOT~BASE58!")).toThrow();
});

test("EnvKeyring: rejects a seed that decodes to the wrong length", () => {
  const tooShort = b58(crypto.getRandomValues(new Uint8Array(31)));
  expect(() => EnvKeyring.fromEnv(tooShort)).toThrow(/32-byte/);
  const tooLong = b58(crypto.getRandomValues(new Uint8Array(33)));
  expect(() => EnvKeyring.fromEnv(tooLong)).toThrow(/32-byte/);
});

test("EnvKeyring: empty keyring is rejected (REVIEW #14 — zero keys = misconfig)", async () => {
  expect(() => EnvKeyring.fromEnv("")).toThrow(/at least one/);
  expect(() => EnvKeyring.fromEnv(",,,")).toThrow(/at least one/);
});

// --- config ----------------------------------------------------------------

const FULL_ENV: Record<string, string> = {
  EVIDENCE_RPC_URL: "https://rpc.example",
  EVIDENCE_PROGRAM_ID: "Acco11111111111111111111111111111111111112",
  EVIDENCE_KEYRING: b58(crypto.getRandomValues(new Uint8Array(32))),
  EVIDENCE_S3_ENDPOINT: "https://s3.example",
  EVIDENCE_S3_BUCKET: "evidence",
  EVIDENCE_S3_REGION: "eu-central-1",
};

test("config: parses a full valid env", () => {
  const cfg = loadConfig(FULL_ENV);
  expect(cfg.rpcUrl).toBe("https://rpc.example");
  expect(cfg.programId).toBe(FULL_ENV.EVIDENCE_PROGRAM_ID!);
  expect(cfg.keyring).toBe(FULL_ENV.EVIDENCE_KEYRING!);
  expect(cfg.s3.bucket).toBe("evidence");
  expect(cfg.s3.forcePathStyle).toBe(false);
  expect(cfg.port).toBe(443);
});

test("config: throws on each missing required var", () => {
  for (const key of [
    "EVIDENCE_RPC_URL",
    "EVIDENCE_PROGRAM_ID",
    "EVIDENCE_KEYRING",
    "EVIDENCE_S3_ENDPOINT",
    "EVIDENCE_S3_BUCKET",
    "EVIDENCE_S3_REGION",
  ]) {
    const env = { ...FULL_ENV };
    delete env[key];
    expect(() => loadConfig(env), `missing ${key}`).toThrow();
  }
});

test("config: empty EVIDENCE_KEYRING is rejected", () => {
  const env = { ...FULL_ENV, EVIDENCE_KEYRING: "   " };
  expect(() => loadConfig(env)).toThrow(/KEYRING/i);
});

test("config: PORT parsed as integer", () => {
  const cfg = loadConfig({ ...FULL_ENV, EVIDENCE_PORT: "8080" });
  expect(cfg.port).toBe(8080);
});

test("config: FORCE_PATH_STYLE true is honoured", () => {
  const cfg = loadConfig({ ...FULL_ENV, EVIDENCE_S3_FORCE_PATH_STYLE: "true" });
  expect(cfg.s3.forcePathStyle).toBe(true);
});

test("config: optional numeric limits parsed", () => {
  const cfg = loadConfig({
    ...FULL_ENV,
    EVIDENCE_RATE_LIMIT_PER_MIN: "120",
    EVIDENCE_MAX_EVIDENCE_BYTES: "1048576",
    EVIDENCE_RETENTION_DAYS: "30",
  });
  expect(cfg.rateLimitPerMin).toBe(120);
  expect(cfg.maxEvidenceBytes).toBe(1048576);
  expect(cfg.retentionDays).toBe(30);
});

test("config: TLS pair surfaced when both present", () => {
  const cfg = loadConfig({ ...FULL_ENV, EVIDENCE_TLS_CERT: "CERT", EVIDENCE_TLS_KEY: "KEY" });
  expect(cfg.tls).toEqual({ cert: "CERT", key: "KEY" });
});

test("config: asymmetric TLS halves throw (loud misconfig surfacing)", () => {
  expect(() => loadConfig({ ...FULL_ENV, EVIDENCE_TLS_CERT: "CERT" })).toThrow(/TLS/);
  expect(() => loadConfig({ ...FULL_ENV, EVIDENCE_TLS_KEY: "KEY" })).toThrow(/TLS/);
});

test("config: TLS absent entirely when neither half is set", () => {
  expect(loadConfig(FULL_ENV).tls).toBeUndefined();
});
