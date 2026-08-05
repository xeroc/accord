import { edwardsToMontgomeryPriv, edwardsToMontgomeryPub, x25519 } from "@noble/curves/ed25519";

/**
 * Ed25519 <-> X25519 conversion and X25519 ECDH helpers.
 *
 * The on-chain `evidence_operator` and `Round.jurors[]` are Ed25519 pubkeys;
 * their Montgomery (X25519) form is the encryption target (libsodium-style
 * `crypto_sign_ed25519_pk_to_curve25519` / `_sk_to_curve25519`). One Ed25519
 * key is dual-used: signing pubkey on-chain, encryption via its X25519 form.
 * See SPEC §Crypto model.
 */

/** Convert an Ed25519 public key (32 bytes) to its X25519 (Montgomery) form. */
export function ed25519ToX25519PublicKey(ed25519Pubkey: Uint8Array): Uint8Array {
  requireLen(ed25519Pubkey, 32, "Ed25519 public key");
  return edwardsToMontgomeryPub(ed25519Pubkey);
}

/** Convert an Ed25519 secret seed (32 bytes) to its X25519 (Montgomery) secret. */
export function ed25519SecretToX25519(ed25519SecretSeed: Uint8Array): Uint8Array {
  requireLen(ed25519SecretSeed, 32, "Ed25519 secret seed");
  return edwardsToMontgomeryPriv(ed25519SecretSeed);
}

/** X25519 ECDH: shared secret from a Montgomery secret + a Montgomery public key. */
export function x25519SharedSecret(mySecret: Uint8Array, theirPublic: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(mySecret, theirPublic);
}

/** Fresh ephemeral X25519 keypair for one ECIES operation. */
export function newX25519KeyPair(): { secret: Uint8Array; publicKey: Uint8Array } {
  const secret = x25519.utils.randomPrivateKey();
  return { secret, publicKey: x25519.getPublicKey(secret) };
}

function requireLen(b: Uint8Array, n: number, what: string): void {
  if (b.length !== n) {
    throw new Error(`${what} must be ${n} bytes, got ${b.length}`);
  }
}
