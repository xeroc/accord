import { readFileSync } from "node:fs";
import bs58 from "bs58";
import {
  type Ed25519Keypair,
  type Keyring,
  ed25519PublicKeyFromSeed,
} from "@useaccord/sdk/evidence";

/**
 * Per-Subaccord operator keyring — the daemon's env-backed `Keyring` impl.
 *
 * The `Keyring` contract + `Ed25519Keypair` type live in `@useaccord/sdk/evidence`
 * (shared with claimant/juror SDK clients); this module supplies the v1 env
 * source. It reads `EVIDENCE_KEYRING` as a comma-separated list where each entry
 * is EITHER:
 *
 *  - A **base58-encoded 32-byte Ed25519 seed** (existing format), OR
 *  - A **path to a `.json` key file** containing the seed as a JSON byte array.
 *
 * File-path detection: an entry is treated as a path when it ends with `.json`
 * or starts with `/`, `./`, or `../`. All other entries are decoded as base58.
 * The two formats may be freely mixed in the same comma-separated list.
 *
 * Supported JSON file formats (the "Uint8Array representation of the private key"):
 *  - `[...32]`  — 32-byte seed array.
 *  - `[...64]`  — 64-byte Solana expanded key (seed ‖ pubkey); first 32 bytes used.
 *  - `{ "secretKey": [...64] }` — Solana keypair file (`solana-keygen` output).
 *  - `{ "seed": [...32] }`      — explicit seed field.
 *
 * The daemon derives each seed's pubkey via the SDK and indexes by pubkey for
 * O(1) runtime resolution. The on-chain `evidence_operator` field is the
 * binding — no key↔subaccord mapping is held out-of-band (ADR-0011 / SPEC
 * §Keyring). Pluggable: a KMS source can implement `Keyring` without touching
 * callers.
 *
 * Plaintext-invariant N/A: these are keys, not evidence.
 */
export class EnvKeyring implements Keyring {
  // Map<string,seed> keyed by hex(pubkey). Not constant-time; the set of operated
  // Subaccords is public (on-chain), so the timing leak is acceptable for v1.
  // Swap to a constant-time compare if operator membership becomes secret.
  private readonly byPubkey: ReadonlyMap<string, Uint8Array>;
  /** Ed25519 public keys (== on-chain evidence_operator set), in insertion order. */
  private readonly pubs: readonly Uint8Array[];

  private constructor(pairs: Iterable<[Uint8Array, Uint8Array]>) {
    const map = new Map<string, Uint8Array>();
    const pubs: Uint8Array[] = [];
    for (const [pub, seed] of pairs) {
      const hex = toHex(pub);
      // Keep pubs in lockstep with the map's distinct keyset (last seed wins in
      // the map; pubs keeps the first occurrence of each distinct pubkey).
      if (!map.has(hex)) pubs.push(pub);
      map.set(hex, seed);
    }
    this.byPubkey = map;
    this.pubs = pubs;
  }

  /**
   * Parse `EVIDENCE_KEYRING`: comma-separated base58 Ed25519 seeds and/or paths
   * to `.json` key files. Sync — file reads happen once at boot before the event
   * loop starts. Throws on any malformed entry.
   */
  static fromEnv(raw: string): EnvKeyring {
    const pairs: Array<[Uint8Array, Uint8Array]> = [];
    const entries = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (entries.length === 0) {
      throw new Error("EVIDENCE_KEYRING must contain at least one non-empty entry");
    }
    for (const entry of entries) {
      const seed = resolveSeed(entry);
      pairs.push([ed25519PublicKeyFromSeed(seed), seed]);
    }
    return new EnvKeyring(pairs);
  }

  /** Number of operators this daemon can serve. */
  get size(): number {
    return this.byPubkey.size;
  }

  /**
   * The Ed25519 public keys this daemon can serve — i.e. the on-chain
   * `evidence_operator` set. Pubkeys are public (they equal the on-chain field);
   * the seeds never leave this class. Used by GET /config (ADR-0011).
   */
  get publicKeys(): readonly Uint8Array[] {
    return this.pubs;
  }

  async forOperator(operatorPubkey: Uint8Array): Promise<Ed25519Keypair | null> {
    if (operatorPubkey.length !== 32) return null;
    const seed = this.byPubkey.get(toHex(operatorPubkey));
    if (!seed) return null;
    return { publicKey: operatorPubkey.slice(), secretKey: seed.slice() };
  }
}

// ---------------------------------------------------------------------------
// Entry resolution: detect file path vs base58 seed, extract the 32-byte seed.
// ---------------------------------------------------------------------------

/** True when the entry should be treated as a filesystem path, not base58. */
function looksLikeFilePath(entry: string): boolean {
  return (
    entry.endsWith(".json") ||
    entry.startsWith("/") ||
    entry.startsWith("./") ||
    entry.startsWith("../")
  );
}

/** Resolve a single keyring entry to a 32-byte Ed25519 seed. */
function resolveSeed(entry: string): Uint8Array {
  if (looksLikeFilePath(entry)) {
    return readSeedFromFile(entry);
  }
  // Base58-encoded 32-byte seed.
  const seed = bs58.decode(entry); // throws on invalid base58
  if (seed.length !== 32) {
    throw new Error(
      `EVIDENCE_KEYRING entry decoded to ${seed.length} bytes, expected a 32-byte Ed25519 seed`,
    );
  }
  return seed;
}

/**
 * Read a `.json` key file and extract the 32-byte Ed25519 seed. Sync — called
 * once at boot. Supports plain byte arrays (32 or 64 elements) and Solana
 * keypair objects (`{ secretKey: [...] }` / `{ seed: [...] }`).
 */
function readSeedFromFile(path: string): Uint8Array {
  const content = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Key file ${path}: not valid JSON`);
  }

  const bytes = extractBytes(parsed, path);
  // 32 bytes = seed; 64 bytes = Solana expanded key (seed ‖ pubkey).
  if (bytes.length === 32) return bytes;
  if (bytes.length === 64) return bytes.slice(0, 32);
  throw new Error(`Key file ${path}: expected 32 or 64 bytes, got ${bytes.length}`);
}

/** Extract a `Uint8Array` from a parsed JSON value (array or keypair object). */
function extractBytes(parsed: unknown, path: string): Uint8Array {
  let raw: unknown;
  if (Array.isArray(parsed)) {
    raw = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    if ("secretKey" in parsed && Array.isArray(parsed.secretKey)) {
      raw = parsed.secretKey;
    } else if ("seed" in parsed && Array.isArray(parsed.seed)) {
      raw = parsed.seed;
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      `Key file ${path}: expected a JSON byte array, { "secretKey": [...] }, or { "seed": [...] }`,
    );
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(
        `Key file ${path}: byte at index ${i} is not a valid uint8 (${JSON.stringify(v)})`,
      );
    }
    bytes[i] = v;
  }
  return bytes;
}

function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}
