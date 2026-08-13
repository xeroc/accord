// Pure functions + types now live in @useaccord/sdk/evidence (ADR-0015).
// Re-export them so existing importers (`../CreateDispute`, `../Voting`, etc.)
// don't need to change their import paths.
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

// App-specific (React/Vite-only — cannot live in the SDK).
export { EVIDENCE_DAEMON_URL } from "./publish";
export { useManifest } from "./useManifest";
export {
  EvidenceEditor,
  downloadManifest,
  type EvidenceEditorOutput,
} from "./EvidenceEditor";
