/**
 * evidence/options.ts — salted option-hash derivation (ADR-0017 §4).
 *
 * On-chain `Dispute.options[i]` is a public `[u8;32]`. To prevent rainbow-
 * tabling short labels, each is `sha256(option_salt ‖ utf8(label_i))` where
 * `option_salt` lives only in the manifest (never on-chain). This module is
 * the single source of truth for that construction — the app self-verifies
 * pre-submit (D2); nothing on-chain enforces it today.
 *
 * Uses the zero-dependency Web Crypto API (`globalThis.crypto`), matching
 * the pattern in `packages/sdk/src/methods/voting.ts:commitHash`.
 */

/** Generate a fresh 32-byte option salt (filer-generated, per-dispute). */
export function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Derive `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))` for each
 * label. Throws if the salt is not 32 bytes (silent wrong hashes would be a
 * correctness footgun).
 */
export async function deriveOptionHashes(
  salt: Uint8Array,
  labels: string[],
): Promise<Uint8Array[]> {
  if (salt.length !== 32) {
    throw new Error(`InvalidOptionSalt: expected 32 bytes, got ${salt.length}`);
  }
  return Promise.all(labels.map((label) => hashOption(salt, label)));
}

/**
 * Self-verify (D2): re-derive and compare against the supplied hashes. Throws
 * on any mismatch — the app fails closed rather than filing a dispute whose
 * options don't match the manifest.
 */
export async function verifyOptionHashes(
  salt: Uint8Array,
  labels: string[],
  hashes: Uint8Array[],
): Promise<void> {
  if (labels.length !== hashes.length) {
    throw new Error(
      `OptionHashMismatch: ${labels.length} labels vs ${hashes.length} hashes`,
    );
  }
  const derived = await deriveOptionHashes(salt, labels);
  for (let i = 0; i < derived.length; i++) {
    if (!bytesEqual(derived[i]!, hashes[i]!)) {
      throw new Error(`OptionHashMismatch at index ${i}`);
    }
  }
}

async function hashOption(
  salt: Uint8Array,
  label: string,
): Promise<Uint8Array> {
  const te = new TextEncoder();
  const labelBytes = te.encode(label);
  const preimage = new Uint8Array(salt.length + labelBytes.length);
  preimage.set(salt, 0);
  preimage.set(labelBytes, salt.length);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", preimage);
  return new Uint8Array(digest);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
