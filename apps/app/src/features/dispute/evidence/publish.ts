/**
 * publish.ts — claimant-side encrypt + POST to the evidence daemon, and
 * manifest-hash verification for the recovery upload path.
 *
 * Authority: ADR-0011 (daemon transport), EVIDENCE-FORMAT.md §2 (root hash),
 * milestone accord-ebel §1 (happy path step 7, recovery).
 */
import { claimantEncrypt, sha256 } from "@useaccord/sdk/evidence";

/**
 * Evidence daemon base URL. Centralized operator — one endpoint per deployment.
 * Override via `VITE_EVIDENCE_DAEMON_URL` for non-local environments.
 */
export const EVIDENCE_DAEMON_URL =
  import.meta.env?.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export interface PublishParams {
  /** Daemon base URL (usually {@link EVIDENCE_DAEMON_URL}). */
  endpoint: string;
  subaccord: string;
  dispute: string;
  /** The single manifest buffer (same bytes that produced `evidence_hash`). */
  manifest: Uint8Array;
  /** Evidence operator's raw Ed25519 public key (32 bytes, decoded from address). */
  operatorPub: Uint8Array;
}

/**
 * Encrypt the manifest to the operator and POST it to the daemon.
 * Daemon ingest is idempotent on `(dispute, round, plaintext_hash)` — same
 * manifest → 201 no-op, first POST wins. Safe to retry without re-creating
 * the dispute.
 */
export async function publishEvidence(params: PublishParams): Promise<void> {
  const { endpoint, subaccord, dispute, manifest, operatorPub } = params;
  const bundle = await claimantEncrypt(manifest, operatorPub);
  const res = await fetch(`${endpoint}/evidence/${subaccord}/${dispute}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ct: toBase64(bundle.ct),
      claimant_ephem_pub: toBase64(bundle.claimant_ephem_pub),
      wrapped: toBase64(bundle.wrapped),
      plaintext_hash: toBase64(bundle.plaintext_hash),
    }),
  });
  if (res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`evidence publish failed: ${res.status} ${body}`);
  }
}

/**
 * Verify `sha256(manifest) == evidenceHash`. Throws on mismatch — the recovery
 * upload is rejected if the manifest doesn't match what was committed on-chain.
 */
export async function verifyManifestHash(
  manifest: Uint8Array,
  evidenceHash: Uint8Array,
): Promise<void> {
  const hash = await sha256(manifest);
  if (!equalBytes(hash, evidenceHash)) {
    throw new Error(
      "manifest hash mismatch — upload does not match on-chain evidence_hash",
    );
  }
}
