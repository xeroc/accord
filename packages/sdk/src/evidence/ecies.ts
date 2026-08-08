/**
 * evidence/ecies.ts — the Accord evidence encryption protocol (ADR-0006).
 *
 * One ECIES-style envelope, two roles:
 *
 *   Ingest (claimant → operator): the claimant encrypts plaintext to the
 *   operator's Ed25519→X25519 key and posts the bundle; the operator decrypts.
 *
 *   Deliver (operator → drawn juror): the operator re-encrypts plaintext to the
 *   juror's Ed25519→X25519 key; only that juror's key decrypts.
 *
 * This is the single byte-exact implementation all three parties import — the
 * claimant and juror run it off-daemon (they are SDK consumers), so the protocol
 * cannot drift between participants. Composition only: every primitive
 * (ECDH, HKDF, AES-GCM, Montgomery conversion) comes from {@link ./crypto} /
 * {@link ./keys}; the only thing owned here is the construction order and the
 * HKDF `info` role labels.
 *
 * Plaintext exists only ephemerally between decrypt and re-encrypt on the
 * operator side; nothing persisted is ever plaintext (SPEC §Encrypted-at-rest).
 *
 * Authority: apps/evidence-daemon/SPEC.md §Crypto model; ADR-0006.
 */
import { randomBytes } from "@noble/hashes/utils";
import { aesGcmDecrypt, aesGcmEncrypt, hkdfSha256, sha256 } from "./crypto.js";
import {
  ed25519SecretToX25519,
  ed25519ToX25519PublicKey,
  newX25519KeyPair,
  x25519SharedSecret,
} from "./keys.js";

/** HKDF `info` labels pin the derivation to its protocol role. */
export const INGEST_INFO = "accord-ingest-v1";
export const DELIVER_INFO = "accord-deliver-v1";

const te = new TextEncoder();

/** Stored ciphertext bundle (ciphertext only — no plaintext field). */
export interface IngestBundle {
  /** AES-GCM(dek, plaintext) — nonce(12) prepended. */
  ct: Uint8Array;
  /** Claimant's ephemeral X25519 public key (32 bytes). */
  claimant_ephem_pub: Uint8Array;
  /** AES-GCM(k_in, dek) — nonce(12) prepended. */
  wrapped: Uint8Array;
  /** sha256(plaintext); matches the dispute's on-chain `evidence_hash`. */
  plaintext_hash: Uint8Array;
}

/** A bundle re-encrypted to a single drawn juror. */
export interface JurorBundle {
  /** AES-GCM(k_out, plaintext) — nonce(12) prepended. */
  out: Uint8Array;
  /** Operator's ephemeral X25519 public key for this delivery (32 bytes). */
  operator_ephem_pub: Uint8Array;
}

/**
 * Claimant-side ingest encryption. Produces the bundle posted to the operator.
 * Claimants run this off-daemon; the operator never calls it in production (it
 * is exposed so claimant SDK clients share one implementation, and for
 * round-trips / test vectors).
 */
export async function claimantEncrypt(
  plaintext: Uint8Array,
  operatorEd25519Pub: Uint8Array,
): Promise<IngestBundle> {
  const dek = randomBytes(32);
  const ct = await aesGcmEncrypt(dek, plaintext);

  const ephem = newX25519KeyPair();
  const opX25519Pub = ed25519ToX25519PublicKey(operatorEd25519Pub);
  const shared = x25519SharedSecret(ephem.secret, opX25519Pub);
  const kIn = await hkdfSha256(shared, te.encode(INGEST_INFO));
  const wrapped = await aesGcmEncrypt(kIn, dek);

  // dek wiped implicitly (local ref dropped); plaintext_hash is metadata, not secret.
  return {
    ct,
    claimant_ephem_pub: ephem.publicKey,
    wrapped,
    plaintext_hash: await sha256(plaintext),
  };
}

/**
 * Operator-side decrypt of a stored bundle → plaintext (in-memory only).
 * Callers MUST run {@link verifyIntegrity} next.
 */
export async function operatorDecrypt(
  bundle: IngestBundle,
  operatorEd25519SecretSeed: Uint8Array,
): Promise<Uint8Array> {
  const opX25519Sk = ed25519SecretToX25519(operatorEd25519SecretSeed);
  const shared = x25519SharedSecret(opX25519Sk, bundle.claimant_ephem_pub);
  const kIn = await hkdfSha256(shared, te.encode(INGEST_INFO));
  const dek = await aesGcmDecrypt(kIn, bundle.wrapped); // throws on auth failure
  return aesGcmDecrypt(dek, bundle.ct);
}

/** Operator re-encrypts plaintext to a drawn juror's Ed25519 pubkey. */
export async function deliverToJuror(
  plaintext: Uint8Array,
  jurorEd25519Pub: Uint8Array,
): Promise<JurorBundle> {
  const ephem = newX25519KeyPair();
  const jurorX25519Pub = ed25519ToX25519PublicKey(jurorEd25519Pub);
  const shared = x25519SharedSecret(ephem.secret, jurorX25519Pub);
  const kOut = await hkdfSha256(shared, te.encode(DELIVER_INFO));
  const out = await aesGcmEncrypt(kOut, plaintext);
  return { out, operator_ephem_pub: ephem.publicKey };
}

/** Juror-side decrypt of a delivered bundle → plaintext. */
export async function jurorDecrypt(
  delivered: JurorBundle,
  jurorEd25519SecretSeed: Uint8Array,
): Promise<Uint8Array> {
  const jurorX25519Sk = ed25519SecretToX25519(jurorEd25519SecretSeed);
  const shared = x25519SharedSecret(jurorX25519Sk, delivered.operator_ephem_pub);
  const kOut = await hkdfSha256(shared, te.encode(DELIVER_INFO));
  return aesGcmDecrypt(kOut, delivered.out);
}

/**
 * Mandatory integrity gate (SPEC §3, §Failure modes): `sha256(plaintext)` MUST
 * equal the dispute's on-chain `evidence_hash`. Both operands are public hashes,
 * so a plain compare suffices (no constant-time requirement). Throws on mismatch
 * — at ingest this rejects a bad upload, at delivery it refuses + alerts.
 */
export async function verifyIntegrity(
  plaintext: Uint8Array,
  evidenceHash: Uint8Array,
): Promise<void> {
  const h = await sha256(plaintext);
  if (h.length !== evidenceHash.length) {
    throw new Error("integrity gate failed: sha256(plaintext) != evidence_hash");
  }
  for (let i = 0; i < h.length; i++) {
    if (h[i] !== evidenceHash[i]) {
      throw new Error("integrity gate failed: sha256(plaintext) != evidence_hash");
    }
  }
}
