/**
 * Synod group assembly math (bean accord-g1dy; milestone accord-daq8 §4).
 *
 * The file-time evidence commitment for a Synod-backed dispute is
 *
 *   evidence_hashes[0] = H(case_pda ‖ h_0 ‖ … ‖ h_{party_count-1})
 *
 * where `h_i` is party `i`'s bundle hash (`plaintext_hash`, committed on-chain
 * at `join` as `SynodCase.evidence[i]`). Recomputing it from the STORED
 * bundles and comparing against the on-chain root detects any daemon-side
 * bundle swap: the PDA identifies the group, the per-party hashes commit it.
 *
 * Shared by the deliver bridge (pipeline/deliver.ts) and the assembled
 * manifest GET (sibling accord-lry5). Pure — the digest is injected.
 */

/** Digest function (the deliver pipeline's `crypto.sha256` port satisfies it). */
export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

/**
 * Recompute the file-time root over the stored per-party hashes. Layout is
 * fixed-width: `case_pda (32) ‖ h_0 (32) ‖ … ‖ h_{n-1} (32)`.
 */
export async function synodEvidenceRoot(
  casePda: Uint8Array,
  perPartyHashes: readonly Uint8Array[],
  sha256: Sha256,
): Promise<Uint8Array> {
  const buf = new Uint8Array(32 * (1 + perPartyHashes.length));
  buf.set(casePda, 0);
  let off = 32;
  for (const h of perPartyHashes) {
    buf.set(h, off);
    off += 32;
  }
  return sha256(buf);
}
