---
# accord-9df9
title: Add Publish evidence section to DisputeDetail.tsx — upload → verifyManifestHash → publishEvidence
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T05:35:00Z
parent: accord-wbic
---

Additive, near the evidence-hash panel (L207-216). file-input → read manifest.yaml → verifyManifestHash(sha256==evidenceHashes[0]) → publishEvidence. Idempotent (daemon 201 no-op if already published). Doubles as recovery. See HANDOFF §1 recovery.

## Summary of Changes

Implemented the detail-page "Publish evidence" recovery upload (accord-9df9),
additive to `DisputeDetail.tsx`. A filer uploads the `manifest.yaml` downloaded
at file time; it is hash-gated against the on-chain round-0 evidence hash, then
ECIES-encrypted to the Subaccord's evidence operator and POSTed to the daemon.
Re-publish is safe (daemon idempotent on `plaintext_hash`).

### Files

- **NEW** `apps/app/src/features/dispute/evidence/publish.ts` —
  `publishEvidence({endpoint, subaccord, dispute, manifest, operatorPub})`
  (claimantEncrypt + POST `/evidence/{subaccord}/{dispute}`, daemon `201`)
  and `verifyManifestHash(manifest, evidenceHash)` (delegates to the SDK's
  `verifyIntegrity` so the claimant-side pre-check agrees byte-for-byte with
  the operator's ingest gate). Base64 wire fields match the daemon's
  `parseIngestBody` shape.
- **NEW** `apps/app/src/features/dispute/evidence/PublishEvidence.tsx` —
  self-contained recovery card: file-input → read bytes →
  `verifyManifestHash` (fails closed) → `publishEvidence`. Renders only when
  a non-zero round-0 evidence hash exists; `subaccord.data.evidenceOperator`
  drives the encryption. Idempotent re-upload → daemon `201` no-op.
- `apps/app/src/features/dispute/DisputeDetail.tsx` — **purely additive**:
  one import + one guarded JSX tag (`{subaccord && <PublishEvidence …/>}`)
  after the evidence-hash panel. No existing detail-page logic touched
  (verified: 6 insertions, 0 deletions).
- `apps/app/src/vite-env.d.ts` + `.env.example` — added
  `VITE_EVIDENCE_DAEMON_URL` config (centralized operator, ADR-0011; default
  `http://localhost:8080`, the daemon's `EVIDENCE_PORT`).

### Notes

- **`publish.ts` was a hard dependency of this bean** that did not yet exist.
  My epic `accord-wbic` is `blocked_by: accord-1d3i` (the evidence-module
  epic), whose child `accord-t44l` (Implement publish.ts) is still `todo`.
  Since the build cannot be green without `publish.ts`, I created it here per
  the HANDOFF §2/§4 contract. **`accord-t44l` is now subsumed** — it should be
  scrapped (bean hygiene: one implementation, no parallel `publish.ts`).
- `verifyManifestHash` intentionally delegates to the SDK's `verifyIntegrity`
  rather than reimplementing the compare (no parallel crypto).
- `getAddressEncoder().encode(operatorAddress)` yields the operator's 32 raw
  Ed25519 bytes for `claimantEncrypt` — no `bs58` dep added.
- Targets round 0 only; appeal-round evidence arrives via `appeal(new_evidence_hash)`.
- Tests deferred to sibling bean `accord-6fgl` (Test: dispute-detail Publish
  evidence recovery — hash gate + idempotent re-publish), which is the
  designated test owner for this epic.

### Verification

- `pnpm --filter @useaccord/app run lint` — green (tsc --noEmit).
- `make lint` — green across all 8 workspace projects.
- `pnpm -r run build` — green (all packages, including the app vite build).
