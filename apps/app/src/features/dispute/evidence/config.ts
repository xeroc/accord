/**
 * config.ts — app-side evidence daemon URL.
 *
 * Deployment-specific (Vite env), kept here rather than in
 * @useaccord/sdk/evidence so the SDK carries no environment coupling
 * (ADR-0011 transport, ADR-0015 crypto→SDK).
 */
export const EVIDENCE_DAEMON_URL =
  import.meta.env.VITE_EVIDENCE_DAEMON_URL ?? "http://localhost:8080";
