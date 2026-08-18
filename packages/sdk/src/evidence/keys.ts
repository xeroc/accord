/**
 * evidence/keys.ts — Ed25519/X25519 key material + the operator keyring
 * contract for the evidence protocol (ADR-0006 / ADR-0011).
 *
 * Solana identities are Ed25519; the protocol encrypts to the on-chain
 * `evidence_operator` and `Round.jurors[]` Ed25519 pubkeys by dual-using each
 * key: signing on-chain (Ed25519) + encryption off-chain via its Montgomery
 * (X25519) form — a libsodium-style `crypto_sign_ed25519_{pk,sk}_to_curve25519`
 * `@noble/curves`; the wrappers only add length + zero-key validation at the
 * public seam.
 */
import {
  ed25519,
  edwardsToMontgomeryPriv,
  edwardsToMontgomeryPub,
  x25519,
} from "@noble/curves/ed25519";

/** Ed25519 keypair material held by the operator. The secret never leaves the keyring. */
export interface Ed25519Keypair {
  /** 32-byte Ed25519 public key (matches the on-chain `evidence_operator` field). */
  publicKey: Uint8Array;
  /** 32-byte Ed25519 secret seed. */
  secretKey: Uint8Array;
}

/**
 * Per-Subaccord operator keyring contract. Resolves the Ed25519 secret whose
 * pubkey matches a Subaccord's on-chain `evidence_operator`, or null when this
 * operator does not operate that Subaccord (the caller maps null → 404). The
 * on-chain field is the binding: no key↔subaccord mapping is held out-of-band.
 *
 * The daemon supplies the env-backed implementation; a file/KMS source can
 * satisfy this without touching callers (ADR-0011).
 */
export interface Keyring {
  forOperator(operatorPubkey: Uint8Array): Promise<Ed25519Keypair | null>;
}

// --- Ed25519 <-> X25519 (libsodium-style; backed by @noble/curves) ---------

/** Convert an Ed25519 public key (32 bytes) to its X25519 (Montgomery) form. */
export function ed25519ToX25519PublicKey(ed25519Pubkey: Uint8Array): Uint8Array {
  requireLen(ed25519Pubkey, 32, "Ed25519 public key");
  // Pubkey::default() converts to Montgomery u=1 (order-2) — the X25519 shared
  // secret would be all zeros and noble throws a cryptic error downstream.
  // Canon's create_list CPI still sets evidence_operator = Pubkey::default().
  if (ed25519Pubkey.every((b) => b === 0)) {
    throw new Error(
      "Ed25519 public key is all zeros (Solana Pubkey::default — unset evidence_operator on-chain); refusing X25519 conversion",
    );
  }
  return edwardsToMontgomeryPub(ed25519Pubkey);
}

/** Convert an Ed25519 secret seed (32 bytes) to its X25519 (Montgomery) secret. */
export function ed25519SecretToX25519(ed25519SecretSeed: Uint8Array): Uint8Array {
  requireLen(ed25519SecretSeed, 32, "Ed25519 secret seed");
  return edwardsToMontgomeryPriv(ed25519SecretSeed);
}

/** X25519 ECDH: shared secret from a Montgomery secret + a Montgomery public key. */
export function x25519SharedSecret(
  mySecret: Uint8Array,
  theirPublic: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(mySecret, theirPublic);
}

/** Fresh ephemeral X25519 keypair for one ECIES operation. */
export function newX25519KeyPair(): { secret: Uint8Array; publicKey: Uint8Array } {
  const secret = x25519.utils.randomPrivateKey();
  return { secret, publicKey: x25519.getPublicKey(secret) };
}

/** Derive the Ed25519 public key from a 32-byte secret seed (keyring indexing). */
export function ed25519PublicKeyFromSeed(seed: Uint8Array): Uint8Array {
  requireLen(seed, 32, "Ed25519 secret seed");
  return ed25519.getPublicKey(seed);
}

function requireLen(b: Uint8Array, n: number, what: string): void {
  if (b.length !== n) {
    throw new Error(`${what} must be ${n} bytes, got ${b.length}`);
  }
}
