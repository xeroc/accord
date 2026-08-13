/**
 * evidence/index.ts — app-side seam over the shared evidence protocol.
 *
 * The manifest / option-hash / publish helpers live in @useaccord/sdk/evidence
 * (ADR-0015); this barrel re-exports them alongside the app-only pieces (the
 * daemon URL, the `useManifest` React hook, and the `EvidenceEditor`).
 */
export {
  buildManifest,
  SHA256_ZERO,
  type ManifestInput,
  type ManifestEntryInput,
  type ManifestCtx,
  generateSalt,
  deriveOptionHashes,
  verifyOptionHashes,
  publishEvidence,
  verifyManifestHash,
  type PublishParams,
  parseManifest,
  optionLabels,
  type ParsedManifest,
} from "@useaccord/sdk/evidence";
export { EVIDENCE_DAEMON_URL } from "./config";
export { useManifest } from "./useManifest";
export {
  EvidenceEditor,
  downloadManifest,
  type EvidenceEditorOutput,
} from "./EvidenceEditor";
