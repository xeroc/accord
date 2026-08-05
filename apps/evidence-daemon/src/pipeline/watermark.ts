/**
 * Watermark seam for the delivery re-encryption pipeline (ADR-0006).
 *
 * v1 is a no-op pass-through: `apply` returns the plaintext unchanged. The
 * trait exists so v1.1 per-juror attribution (bean `accord-1acp`) can embed a
 * fingerprint in the returned bytes *before* Juror-bound re-encryption,
 * without touching the pipeline call site or the on-chain program.
 *
 * `juror` is the drawn juror's 32-byte Ed25519 public key (from `Round.jurors[]`).
 * `plaintext` is the in-memory cleartext; it is never persisted.
 */
export interface Watermark {
  apply(plaintext: Uint8Array, juror: Uint8Array): Uint8Array;
}

/** No-op watermark (v1). Returns the plaintext unchanged. */
export const NoOpWatermark: Watermark = {
  apply: (plaintext: Uint8Array): Uint8Array => plaintext,
};
