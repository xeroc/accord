/**
 * ECIES: ingest encryption (claimant -> operator) and delivery re-encryption
 * (operator -> juror). Plaintext exists only in memory between decrypt and
 * re-encrypt and is never returned to storage (SPEC §Crypto model, §Encrypted-at-rest).
 *
 * Ingest (claimant builds the bundle):
 *   dek = random 32; ct = AES-GCM(dek, plaintext);
 *   ephem X25519; shared = X25519(ephem, EdToX25519(operator_pub));
 *   k_in = HKDF(shared, "accord-ingest-v1"); wrapped = AES-GCM(k_in, dek);
 *   plaintext_hash = sha256(plaintext)  // == on-chain evidence_hash
 *
 * Delivery (operator -> juror):
 *   ephem2 X25519; shared = X25519(ephem2, EdToX25519(juror_pub));
 *   k_out = HKDF(shared, "accord-deliver-v1"); out = AES-GCM(k_out, plaintext);
 *   { out, operator_ephem_pub = X25519_pub(ephem2) }
 */
import { aesGcmDecrypt, aesGcmEncrypt, constantTimeEqual, hkdfSha256, sha256 } from "./symmetric";
import {
  ed25519SecretToX25519,
  ed25519ToX25519PublicKey,
  newX25519KeyPair,
  x25519SharedSecret,
} from "../keys/ed25519";

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
 * Claimant-side ingest encryption. Produces the bundle posted to
 * `POST /evidence/{subaccord}/{dispute}`. The daemon uses this only for
 * round-trips / test vectors; claimants run it off-daemon.
 */
export async function claimantEncrypt(
  plaintext: Uint8Array,
  operatorEd25519Pub: Uint8Array,
): Promise<IngestBundle> {
  const dek = globalThis.crypto.getRandomValues(new Uint8Array(32));
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
 * Operator-side decrypt of a stored bundle -> plaintext (in-memory only).
 * Used by the delivery pipeline; callers MUST run {@link verifyIntegrity} next.
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

/** Juror-side decrypt of a delivered bundle -> plaintext. */
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
 * Mandatory integrity gate (SPEC §3, §Failure modes): `sha256(plaintext)`
 * MUST equal the dispute's on-chain `evidence_hash`. Throws on mismatch — at
 * ingest this rejects a bad upload, at delivery it refuses + alerts.
 */
export async function verifyIntegrity(
  plaintext: Uint8Array,
  evidenceHash: Uint8Array,
): Promise<void> {
  if (!constantTimeEqual(await sha256(plaintext), evidenceHash)) {
    throw new Error("integrity gate failed: sha256(plaintext) != evidence_hash");
  }
}
