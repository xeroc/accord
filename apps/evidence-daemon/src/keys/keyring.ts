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
 * source. It reads `EVIDENCE_KEYRING` (comma-separated base58 Ed25519 raw
 * secrets), derives each secret's pubkey via the SDK, and indexes by pubkey for
 * O(1) runtime resolution. The on-chain `evidence_operator` field is the
 * binding — no key↔subaccord mapping is held out-of-band (ADR-0011 / SPEC
 * §Keyring). Pluggable: a file/KMS source can implement `Keyring` without
 * touching callers.
 *
 * Plaintext-invariant N/A: these are keys, not evidence.
 */
export class EnvKeyring implements Keyring {
  // Map<string,seed> keyed by hex(pubkey). Not constant-time; the set of operated
  // Subaccords is public (on-chain), so the timing leak is acceptable for v1.
  // Swap to a constant-time compare if operator membership becomes secret.
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
    if (secrets.length === 0) {
      throw new Error("EVIDENCE_KEYRING must contain at least one non-empty base58 Ed25519 secret");
    }
    for (const entry of secrets) {
      const seed = bs58.decode(entry); // throws on invalid base58
      if (seed.length !== 32) {
        throw new Error(
          `EVIDENCE_KEYRING entry decoded to ${seed.length} bytes, expected a 32-byte Ed25519 seed`,
        );
      }
      pairs.push([ed25519PublicKeyFromSeed(seed), seed]);
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
