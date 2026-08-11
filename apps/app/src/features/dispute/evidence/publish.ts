/**
 * evidence/publish.ts — claimant-side publish to the evidence daemon.
 *
 * `publishEvidence` encrypts the manifest buffer (via `claimantEncrypt` from
 * `@useaccord/sdk/evidence`) and POSTs the base64 bundle to the daemon's
 * `POST /evidence/{subaccord}/{dispute}` endpoint (round 0 default). The
 * daemon ingests idempotently on `(dispute, round, plaintext_hash)` — a retry
 * with the same manifest returns `201` no-op.
 *
 * `verifyManifestHash` gates the detail-page recovery flow: it asserts
 * `sha256(manifest) == evidenceHash` before publishing an uploaded manifest.
 * Re-exports the SDK's `verifyIntegrity` — same operation, already implemented
 * and unit-tested in `@useaccord/sdk/evidence`.
 *
 * Authority: milestone HANDOFF §4; ADR-0006 / ADR-0011.
 */
export { verifyIntegrity as verifyManifestHash } from "@useaccord/sdk/evidence";

import { claimantEncrypt } from "@useaccord/sdk/evidence";

export interface PublishEvidenceArgs {
  /** Daemon base URL (no trailing slash), e.g. `https://evidence.useaccord.xyz`. */
  endpoint: string;
  /** Subaccord address (base58). */
  subaccord: string;
  /** Dispute address (base58). */
  dispute: string;
  /** Serialized manifest bytes (the single buffer from `buildManifest`). */
  manifest: Uint8Array;
  /** Evidence operator Ed25519 pubkey (32 bytes, decoded from `subaccord.evidenceOperator`). */
  operatorPub: Uint8Array;
}

/**
 * Encrypt the manifest and POST it to the evidence daemon. Throws on any
 * non-201 response or network failure. Safe to retry with the same manifest
 * (daemon returns 201 idempotent on matching `plaintext_hash`).
 */
export async function publishEvidence(
  args: PublishEvidenceArgs,
): Promise<void> {
  const { endpoint, subaccord, dispute, manifest, operatorPub } = args;
  const bundle = await claimantEncrypt(manifest, operatorPub);
  const res = await fetch(`${endpoint}/evidence/${subaccord}/${dispute}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ct: bytesToBase64(bundle.ct),
      claimant_ephem_pub: bytesToBase64(bundle.claimant_ephem_pub),
      wrapped: bytesToBase64(bundle.wrapped),
      plaintext_hash: bytesToBase64(bundle.plaintext_hash),
    }),
  });
  if (res.status !== 201) {
    const body = await res.json().catch(() => null);
    const detail = body?.error ?? res.statusText;
    throw new Error(`evidence publish failed: ${res.status} ${detail}`);
  }
}

/** Base64-encode bytes — matches the daemon's `bytesToBase64` byte-for-byte. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
