/**
 * EvidenceStore trait + EvidenceBundle data model.
 *
 * Authority: apps/evidence-daemon/SPEC.md §"Data model". The stored object is
 * CIPHERTEXT ONLY — there is no plaintext field on {@link EvidenceBundle}, by
 * type construction (ADR-0006 / ADR-0011 encrypted-at-rest invariant).
 */

import { address, type Address } from "@solana/kit";

/**
 * SHA-256 of the plaintext — equals the on-chain `Dispute.evidence_hash`.
 * Used as the idempotency key and the delivery integrity gate. 32 bytes.
 */
export type PlaintextHash = Uint8Array;

/**
 * Encrypted evidence bundle. The unit of storage. CIPHERTEXT ONLY: the only
 * secrets held are the claimant-produced ciphertexts (`ct`, `wrapped`) and the
 * ephemeral pubkey. `plaintextHash` is metadata (it is also on-chain), not a
 * secret. No field here is or contains the plaintext.
 */
export interface EvidenceBundle {
  /** Subaccord address — S3 key prefix and operator-key selector. */
  readonly subaccord: Address;
  /** Dispute address — S3 key suffix, primary index. */
  readonly dispute: Address;
  /** AES-256-GCM(plaintext) under the DEK — ciphertext. */
  readonly ct: Uint8Array;
  /** Claimant's ephemeral X25519 pubkey (32 bytes). */
  readonly claimantEphemPub: Uint8Array;
  /** AES-256-GCM(DEK) under claimant↔operator ECDH — ciphertext (DEK envelope). */
  readonly wrapped: Uint8Array;
  /** sha256(plaintext); idempotency key + mandatory integrity gate. */
  readonly plaintextHash: Uint8Array;
  /** Unix ms at ingest. */
  readonly ingestedAt: number;
}

/**
 * Raised by {@link EvidenceStore.put} when an object already exists at the key
 * with a *different* `plaintextHash`. Maps to HTTP 409. An equal hash is a
 * no-op (idempotent) and does not raise.
 */
export class EvidenceConflictError extends Error {
  readonly subaccord: Address;
  readonly dispute: Address;
  /** Hash already stored at the key (32 bytes, or empty if metadata absent). */
  readonly existingHash: Uint8Array;

  constructor(b: {
    subaccord: Address;
    dispute: Address;
    existingHash: Uint8Array;
  }) {
    super(
      `evidence conflict for ${b.subaccord}/${b.dispute}: a different plaintext_hash is already stored`,
    );
    this.name = "EvidenceConflictError";
    this.subaccord = b.subaccord;
    this.dispute = b.dispute;
    this.existingHash = b.existingHash;
  }
}

/**
 * Pluggable ciphertext store. v1 implementation: {@link ./s3.ts S3Store}
 * (S3/MinIO). The trait enables IPFS/Arweave/Postgres swaps without touching
 * callers.
 *
 * Invariants every implementation MUST uphold:
 *  - Persist ciphertext only — never accept or store a plaintext field
 *    (enforced structurally by {@link EvidenceBundle}).
 *  - `put` is idempotent on `plaintextHash`: a re-PUT of the same hash is a
 *    no-op; a re-PUT of a different hash raises {@link EvidenceConflictError}.
 */
export interface EvidenceStore {
  /**
   * Store the bundle. Idempotent on `plaintextHash`:
   *  - same hash already stored ⇒ no-op (success);
   *  - different hash already stored ⇒ throws {@link EvidenceConflictError};
   *  - no object ⇒ creates it.
   */
  put(b: EvidenceBundle): Promise<void>;
  /** Returns the bundle, or `null` if no object exists at the key. */
  get(subaccord: Address, dispute: Address): Promise<EvidenceBundle | null>;
  /** Idempotent removal. No-op if the key is absent. */
  delete(subaccord: Address, dispute: Address): Promise<void>;
  /** `true` iff an object exists at the key. */
  exists(subaccord: Address, dispute: Address): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Serialization (JSON + base64). Used by any byte-oriented store impl.
// CBOR would shave a few bytes; JSON needs no dependency and the body is
// already ciphertext, so size is dominated by the evidence itself.
// ---------------------------------------------------------------------------

interface BundleJson {
  v: 1;
  subaccord: string;
  dispute: string;
  ct: string;
  claimant_ephem_pub: string;
  wrapped: string;
  plaintext_hash: string;
  ingested_at: number;
}

/** Base64 encode (standard alphabet) for transport/storage of byte fields. */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/** Base64 decode. Throws on invalid input (caller validates at trust boundary). */
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Constant-time-ish equality for 32-byte hashes; timing is not a secret here. */
export function hashEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Serialize a bundle to a JSON string (UTF-8). Ciphertext only. */
export function serializeBundle(b: EvidenceBundle): string {
  const j: BundleJson = {
    v: 1,
    subaccord: b.subaccord,
    dispute: b.dispute,
    ct: bytesToBase64(b.ct),
    claimant_ephem_pub: bytesToBase64(b.claimantEphemPub),
    wrapped: bytesToBase64(b.wrapped),
    plaintext_hash: bytesToBase64(b.plaintextHash),
    ingested_at: b.ingestedAt,
  };
  return JSON.stringify(j);
}

/** Deserialize a bundle from a JSON string. Inverse of {@link serializeBundle}. */
export function deserializeBundle(s: string): EvidenceBundle {
  const j = JSON.parse(s) as BundleJson;
  if (j.v !== 1) throw new Error(`unsupported EvidenceBundle version: ${j.v}`);
  return {
    // `address()` brands the base58 string; throws on malformed input, which
    // is the right behaviour for a corrupted/tampered stored object.
    subaccord: address(j.subaccord),
    dispute: address(j.dispute),
    ct: base64ToBytes(j.ct),
    claimantEphemPub: base64ToBytes(j.claimant_ephem_pub),
    wrapped: base64ToBytes(j.wrapped),
    plaintextHash: base64ToBytes(j.plaintext_hash),
    ingestedAt: j.ingested_at,
  };
}
