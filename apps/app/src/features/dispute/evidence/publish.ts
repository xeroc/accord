/**
 * evidence/publish.ts — claimant-side manifest publish + upload-recovery gate.
 *
 * Two domain entry points over the shared `@useaccord/sdk/evidence` crypto
 * protocol (ADR-0006 / ADR-0015):
 *
 *   - {@link publishEvidence}: ECIES-encrypt the manifest to the Subaccord's
 *     evidence operator and POST the bundle to the daemon. Round 0 (filer
 *     evidence). Idempotent on `plaintext_hash` — a re-POST of the same
 *     manifest is a daemon `201` no-op (store.ts put), so retry is safe.
 *   - {@link verifyManifestHash}: assert `sha256(manifest) == evidence_hash`
 *     before publishing. Fails closed (throws) — a tampered or wrong manifest
 *     never reaches the daemon. Delegates to the SDK's integrity gate so the
 *     check is byte-identical to the operator's ingest gate.
 *
 * Per EVIDENCE-FORMAT.md §2 the root hash is over the exact manifest bytes,
 * delivered verbatim — no canonicalization. The manifest buffer the caller
 * hashes here is the same buffer encrypted and posted; single-source.
 *
 * Authority: milestone accord-ebel HANDOFF §2/§4; ADR-0006, ADR-0011, ADR-0023.
 */
import {
  type Address,
  type ReadonlyUint8Array,
  getAddressEncoder,
} from "@solana/kit";
import { claimantEncrypt, verifyIntegrity } from "@useaccord/sdk/evidence";

/** Base64 (standard alphabet) for the daemon's base64 JSON body fields. */
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export interface PublishEvidenceParams {
  /** Daemon base URL (no trailing slash), e.g. https://evidence.useaccord.xyz. */
  endpoint: string;
  /** Subaccord address (base58) — daemon path param. */
  subaccord: string;
  /** Dispute address (base58) — daemon path param. */
  dispute: string;
  /** The manifest bytes — the exact buffer that was hashed on-chain. */
  manifest: Uint8Array;
  /** The Subaccord's `evidence_operator` Ed25519 pubkey (base58 address). */
  operatorPub: string;
}

/**
 * Encrypt the manifest to the operator and POST it to the evidence daemon
 * (round 0 / filer evidence). Idempotent: the daemon treats a re-POST of the
 * same `plaintext_hash` as a `201` no-op; a *different* hash at the same slot
 * is a `409` conflict. Throws on any non-`201` response.
 *
 * The body shape matches the daemon's {@link parseIngestBody} wire contract:
 * `{ ct, claimant_ephem_pub, wrapped, plaintext_hash }` as base64 strings.
 */
export async function publishEvidence(
  params: PublishEvidenceParams,
): Promise<void> {
  // getAddressEncoder().encode returns ReadonlyUint8Array; claimantEncrypt
  // takes a mutable Uint8Array. Copy once — 32 bytes, negligible.
  const opBytesEncoded = getAddressEncoder().encode(
    params.operatorPub as Address,
  );
  const operatorBytes = new Uint8Array(opBytesEncoded);
  const bundle = await claimantEncrypt(params.manifest, operatorBytes);
  const res = await fetch(
    `${params.endpoint}/evidence/${params.subaccord}/${params.dispute}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ct: bytesToBase64(bundle.ct),
        claimant_ephem_pub: bytesToBase64(bundle.claimant_ephem_pub),
        wrapped: bytesToBase64(bundle.wrapped),
        plaintext_hash: bytesToBase64(bundle.plaintext_hash),
      }),
    },
  );
  if (res.status !== 201) {
    throw new Error(`evidence publish failed: ${res.status}`);
  }
}

/**
 * Gate the detail-page upload: assert `sha256(manifest) == evidence_hash`.
 * Fails closed — a mismatched manifest is rejected before publish. This is the
 * same integrity gate the operator runs at ingest (`verifyIntegrity`), so the
 * claimant-side pre-check and the daemon-side gate agree byte-for-byte.
 */
export async function verifyManifestHash(
  manifest: Uint8Array,
  evidenceHash: ReadonlyUint8Array,
): Promise<void> {
  // verifyIntegrity is read-only on evidenceHash (byte compare only); copy the
  // 32-byte hash to satisfy its mutable-Uint8Array signature without a cast.
  await verifyIntegrity(manifest, new Uint8Array(evidenceHash));
}
