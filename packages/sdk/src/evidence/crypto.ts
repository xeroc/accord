/**
 * evidence/crypto.ts — symmetric primitive spine for the Accord evidence
 * protocol (ADR-0006).
 *
 * Every primitive delegates to the audited `@noble` suite (`@noble/ciphers`,
 * `@noble/hashes`). Nothing here is hand-rolled: this module only fixes the two
 * protocol policies the claimant/operator/juror must share byte-for-byte —
 *
 *   - AES-256-GCM wire blob = `nonce(12) ‖ ciphertext ‖ tag(16)`
 *   - HKDF-SHA256 with an empty salt and a role-pinning `info` label
 *
 * — exactly as {@link ../methods/mst.ts} fixes a node layout over a library
 * hash. Functions are `async` to match the SPEC's stated crypto model and keep
 * callers (the daemon's injected ports, SDK consumers) await-shaped.
 *
 * Authority: apps/evidence-daemon/SPEC.md §Crypto model; ADR-0006.
 */
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

const AES_NONCE_BYTES = 12;
const AES_TAG_BYTES = 16;

/** SHA-256 digest (32 bytes). */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return nobleSha256(data);
}

/**
 * HKDF-SHA256 with an empty salt (per SPEC §Crypto model) and a protocol `info`
 * label that pins the derived key to its role (ingest vs deliver).
 */
export async function hkdfSha256(
  ikm: Uint8Array,
  info: Uint8Array,
  length = 32,
): Promise<Uint8Array> {
  return hkdf(nobleSha256, ikm, new Uint8Array(0), info, length);
}

/** AES-256-GCM encrypt → `nonce(12) ‖ ciphertext ‖ tag(16)` (SPEC wire format). */
export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  requireKey(key);
  const nonce = randomBytes(AES_NONCE_BYTES);
  const ct = gcm(key, nonce).encrypt(plaintext); // ciphertext ‖ tag(16)
  const out = new Uint8Array(AES_NONCE_BYTES + ct.length);
  out.set(nonce, 0);
  out.set(ct, AES_NONCE_BYTES);
  return out;
}

/** AES-256-GCM decrypt of a `nonce(12) ‖ ciphertext ‖ tag(16)` blob. Throws on auth failure. */
export async function aesGcmDecrypt(
  key: Uint8Array,
  blob: Uint8Array,
): Promise<Uint8Array> {
  requireKey(key);
  if (blob.length < AES_NONCE_BYTES + AES_TAG_BYTES) {
    throw new Error("AES-GCM blob too short (missing nonce/tag)");
  }
  const nonce = blob.subarray(0, AES_NONCE_BYTES);
  const ct = blob.subarray(AES_NONCE_BYTES);
  return gcm(key, nonce).decrypt(ct);
}

function requireKey(key: Uint8Array): void {
  if (key.length !== 32) {
    throw new Error(`AES-256 key must be 32 bytes, got ${key.length}`);
  }
}
