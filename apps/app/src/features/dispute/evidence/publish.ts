/**
 * publish.ts — app-specific evidence daemon URL. The encrypt + POST logic
 * (publishEvidence, verifyManifestHash) now lives in `@useaccord/sdk/evidence`.
 * This file keeps only the Vite env-backed default that the React hooks import.
 */

/**
 * Evidence daemon base URL. Centralized operator — one endpoint per deployment.
 * Override via `VITE_EVIDENCE_DAEMON_URL` for non-local environments.
 */
export const EVIDENCE_DAEMON_URL =
  import.meta.env?.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";

// Re-export so existing importers (useManifest, index) don't break.
export { publishEvidence, verifyManifestHash, type PublishParams } from "@useaccord/sdk/evidence";
