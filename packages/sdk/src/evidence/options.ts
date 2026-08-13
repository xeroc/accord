/**
 * options.ts — option-salt derivation + self-verify.
 *
 * `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))` (EVIDENCE-FORMAT.md §4).
 * The salt is app-generated, per-dispute, and lives only in the manifest.
 * `verifyOptionHashes` runs pre-submit — nothing on-chain enforces this today
 * (ADR-0017 open; D2 trustlessly closed when it lands).
 */
import { sha256 } from "./crypto.js";

/** Generate a 32-byte random salt via the Web Crypto API. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

const te = new TextEncoder();

/**
 * Derive `Dispute.options[i] = sha256(option_salt ‖ utf8(label_i))` for each label.
 * Returns 32-byte digests in label order. Throws if salt is not 32 bytes — a
 * wrong-length salt produces silently-wrong hashes (correctness footgun).
 */
export async function deriveOptionHashes(
  salt: Uint8Array,
  labels: string[],
): Promise<Uint8Array[]> {
  if (salt.length !== 32) {
    throw new Error(`InvalidOptionSalt: expected 32 bytes, got ${salt.length}`);
  }
  return Promise.all(
    labels.map((label) => sha256(concat(salt, te.encode(label)))),
  );
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Verify that `hashes[i] == sha256(salt ‖ utf8(labels[i]))` for all i.
 * Throws on mismatch — fails closed (D2 self-verify, app-side).
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
    if (!equalBytes(derived[i]!, hashes[i]!)) {
      throw new Error(`option-hash mismatch at index ${i}`);
    }
  }
}
