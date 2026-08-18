/**
 * Synod assembled-manifest pipeline: `GET /evidence/synod/{case}` (bean
 * accord-lry5; milestone accord-daq8 HANDOFF §4 `manifestGET`).
 *
 * Assembles the case's pre-dispute group into ONE multi-bundle manifest:
 * every roster slot appears with ADR-0017 payload attribution (the `party`
 * field), slots without a stored bundle marked absent (partial pre-file
 * view).
 *
 * Post-file verification: once `SynodCase.dispute` is bound, recompute the
 * file-time root `H(case_pda ‖ h_0 ‖ … ‖ h_{party_count-1})` from the STORED
 * bundles' hashes and compare against the bound dispute's
 * `evidence_hashes[0]` → `verified: true/false`. A mismatch (or a missing
 * slot, which makes the root non-computable) ⇒ `verified: false` — the
 * deliver bridge (accord-g1dy) refuses juror assembly on the same input;
 * this endpoint still reports the assembled view so operators can see WHAT
 * diverged. Pre-file there is nothing to verify: `verified` is `null`.
 *
 * The daemon decrypts each present slot in memory with the operator key
 * (same path as the dispute-keyed manifest handler); plaintext is ephemeral
 * and never persisted (ADR-0006). An undecryptable slot keeps its entry with
 * `manifest: null` — pre-file junk bundles are expected by design.
 */
import type { EvidenceBundle, IngestStore } from "./ingest.js";
import type { SynodCaseView } from "./synod-ingest.js";
import { synodEvidenceRoot } from "./synod-group.js";

export interface SynodManifestChain {
  readSynodCase(casePda: Uint8Array): Promise<SynodCaseView | null>;
  /** The bound dispute's `evidence_hashes[0]`; null if the account is absent. */
  readDisputeRoot(dispute: Uint8Array): Promise<Uint8Array | null>;
}

/** Operator decrypt closure — wire builds it from the keyring + ECIES. */
export type BundleDecryptor = (b: EvidenceBundle) => Promise<Uint8Array | null>;

export interface SynodManifestDeps {
  store: IngestStore;
  chain: SynodManifestChain;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
  decrypt: BundleDecryptor;
}

/** One roster slot in the assembled view. */
export type SynodManifestParty =
  | {
      party: number;
      present: true;
      plaintext_hash: Uint8Array;
      ingested_at: number;
      /** Decrypted ADR-0017 manifest (parsed JSON if possible, else raw UTF-8); null = undecryptable. */
      manifest: unknown;
    }
  | { party: number; present: false };

export interface SynodManifestBody {
  party_count: number;
  /** Every roster slot 0..party_count-1, present flag per slot. */
  parties: SynodManifestParty[];
  /** null pre-file (nothing to verify); true/false post-file. */
  verified: boolean | null;
}

export type SynodManifestOutcome =
  { status: 200; body: SynodManifestBody } | { status: 404; reason: string };

const ZERO32_LEN = 32;

function isZero32(b: Uint8Array): boolean {
  if (b.length !== ZERO32_LEN) return false;
  return b.every((v) => v === 0);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function synodManifest(
  casePda: Uint8Array,
  deps: SynodManifestDeps,
): Promise<SynodManifestOutcome> {
  const cv = await deps.chain.readSynodCase(casePda);
  if (cv === null) return { status: 404, reason: "case not found" };

  const bundles = new Map<number, EvidenceBundle>();
  const parties: SynodManifestParty[] = [];
  for (let slot = 0; slot < cv.party_count; slot++) {
    const b = await deps.store.get(cv.subaccord, casePda, slot);
    if (b === null) {
      parties.push({ party: slot, present: false });
      continue;
    }
    bundles.set(slot, b);
    const plaintext = await deps.decrypt(b);
    let manifest: unknown = null;
    if (plaintext !== null) {
      const text = new TextDecoder().decode(plaintext);
      try {
        manifest = JSON.parse(text);
      } catch {
        manifest = text;
      }
    }
    parties.push({
      party: slot,
      present: true,
      plaintext_hash: b.plaintext_hash,
      ingested_at: b.ingested_at,
      manifest,
    });
  }

  if (isZero32(cv.dispute)) {
    return { status: 200, body: { party_count: cv.party_count, parties, verified: null } };
  }

  const expected = await deps.chain.readDisputeRoot(cv.dispute);
  if (expected === null) {
    return { status: 404, reason: "bound dispute not found" };
  }

  // Root over the STORED hashes; any absent slot makes it non-computable →
  // verified:false (the deliver bridge refuses assembly on the same input).
  let verified = false;
  if (bundles.size === cv.party_count) {
    const stored = [...Array(cv.party_count).keys()].map((s) => bundles.get(s)!.plaintext_hash);
    const actual = await synodEvidenceRoot(casePda, stored, deps.sha256);
    verified = bytesEqual(actual, expected);
  }

  return { status: 200, body: { party_count: cv.party_count, parties, verified } };
}
