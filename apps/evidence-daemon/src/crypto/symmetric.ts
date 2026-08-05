/**
 * Symmetric primitives: SHA-256, HKDF-SHA256, AES-256-GCM, constant-time compare.
 * Backed by the platform Web Crypto (Bun) so no extra crypto deps are pulled in.
 *
 * AES-GCM wire format: the 12-byte nonce is prepended to the ciphertext+tag, so
 * `blob = nonce(12) || ct || tag(16)`. The daemon stores these blobs verbatim;
 * the nonce is not a separate field in {@link EvidenceBundle} (SPEC §Data model).
 */

const AES_NONCE_BYTES = 12;
const AES_TAG_BITS = 128;
const subtle = globalThis.crypto.subtle;

/** SHA-256 digest (32 bytes). */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest("SHA-256", data));
}

/** HKDF-SHA256 to a `length`-byte key (empty salt, per SPEC §Crypto model). */
export async function hkdfSha256(
  ikm: Uint8Array,
  info: Uint8Array,
  length = 32,
): Promise<Uint8Array> {
  const keyMaterial = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** AES-256-GCM encrypt: returns `nonce(12) || ciphertext || tag(16)`. */
export async function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  requireKey(key);
  const cryptoKey = await subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(AES_NONCE_BYTES));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: AES_TAG_BITS },
    cryptoKey,
    plaintext,
  );
  const out = new Uint8Array(nonce.length + ct.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ct), nonce.length);
  return out;
}

/** AES-256-GCM decrypt of a `nonce(12) || ciphertext || tag(16)` blob. Throws on auth failure. */
export async function aesGcmDecrypt(key: Uint8Array, blob: Uint8Array): Promise<Uint8Array> {
  requireKey(key);
  if (blob.length < AES_NONCE_BYTES + 16) {
    throw new Error("AES-GCM blob too short (missing nonce/tag)");
  }
  const cryptoKey = await subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
  const nonce = blob.subarray(0, AES_NONCE_BYTES);
  const ct = blob.subarray(AES_NONCE_BYTES);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: AES_TAG_BITS },
    cryptoKey,
    ct,
  );
  return new Uint8Array(pt);
}

/** Constant-time equality for secrets/hashes. Length mismatch returns false. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function requireKey(key: Uint8Array): void {
  if (key.length !== 32) {
    throw new Error(`AES-256 key must be 32 bytes, got ${key.length}`);
  }
}
