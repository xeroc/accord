import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

/** Ed25519 keypair material held by the operator. The secret never leaves the keyring. */
export interface Ed25519Keypair {
  /** 32-byte Ed25519 public key (matches the on-chain `evidence_operator` field). */
  publicKey: Uint8Array;
  /** 32-byte Ed25519 secret seed. */
  secretKey: Uint8Array;
}

/**
 * Per-Subaccord operator keyring. Resolves the Ed25519 secret whose pubkey
 * matches a Subaccord's on-chain `evidence_operator` field, or null when this
 * daemon does not operate that Subaccord (the API layer maps null -> 404).
 *
 * The on-chain field is the binding: a request names a Subaccord, the daemon
 * reads `Subaccord.evidence_operator`, then looks the pubkey up here. No
 * Subaccord enumeration, no key<->subaccord binding in env (ADR-0011 / SPEC §Keyring).
 *
 * Pluggable: v1 is {@link EnvKeyring}; a file/KMS source can implement this
 * without touching callers.
 */
export interface Keyring {
  forOperator(operatorPubkey: Uint8Array): Promise<Ed25519Keypair | null>;
}

/**
 * v1 keyring: parses `EVIDENCE_KEYRING` (comma-separated base58 Ed25519 raw
 * secrets), derives each secret's pubkey, and indexes by pubkey for O(1)
 * runtime resolution. Plaintext-invariant N/A; these are keys, not evidence.
 */
export class EnvKeyring implements Keyring {
  // ponytail: Map<string,seed> keyed by hex(pubkey). Not constant-time; the set
  // of operated Subaccords is public (on-chain), so the timing leak is acceptable
  // for v1. Swap to a constant-time compare if operator membership becomes secret.
  private readonly byPubkey: ReadonlyMap<string, Uint8Array>;

  private constructor(pairs: Iterable<[Uint8Array, Uint8Array]>) {
    const map = new Map<string, Uint8Array>();
    for (const [pub, seed] of pairs) map.set(toHex(pub), seed);
    this.byPubkey = map;
  }

  /** Parse `EVIDENCE_KEYRING`: comma-separated base58 Ed25519 raw secrets. */
  static fromEnv(raw: string): EnvKeyring {
    const pairs: Array<[Uint8Array, Uint8Array]> = [];
    const secrets = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const entry of secrets) {
      const seed = bs58.decode(entry); // throws on invalid base58
      if (seed.length !== 32) {
        throw new Error(
          `EVIDENCE_KEYRING entry decoded to ${seed.length} bytes, expected a 32-byte Ed25519 seed`,
        );
      }
      pairs.push([ed25519.getPublicKey(seed), seed]);
    }
    return new EnvKeyring(pairs);
  }

  /** Number of operators this daemon can serve. */
  get size(): number {
    return this.byPubkey.size;
  }

  async forOperator(operatorPubkey: Uint8Array): Promise<Ed25519Keypair | null> {
    if (operatorPubkey.length !== 32) return null;
    const seed = this.byPubkey.get(toHex(operatorPubkey));
    if (!seed) return null;
    return { publicKey: operatorPubkey.slice(), secretKey: seed.slice() };
  }
}

function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}
