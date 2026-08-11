---
# accord-emy2
title: Wire format mode into CreateDispute.tsx — mode toggle, resolve-branch, download-at-submit-start, POST append, retry UX
status: completed
type: task
priority: normal
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T03:30:00Z
parent: accord-1696
---

Surgical additive glue. mode state; format mode renders EvidenceEditor instead of raw hash inputs; handleSubmit resolves {options,evidenceHash,manifest} by mode → verifyOptionHashes → download synchronously pre-await → spine UNCHANGED (L145-166) → publishEvidence after sendInstruction → on fail stay-on-form [Retry publish](POST-only)/[View dispute]. See HANDOFF §1/§3.

## Summary of Changes

### New module: `apps/app/src/features/dispute/evidence/`

- **`manifest.ts`** — `buildManifest(input, ctx): Uint8Array` hand-serializes `accord-evidence/v1` YAML into a single deterministic buffer (no YAML dependency). `SHA256_ZERO` sentinel. Pure function; same input → byte-identical buffer.
- **`options.ts`** — `generateSalt()` (32 random bytes via Web Crypto), `deriveOptionHashes(salt, labels)` → `sha256(salt ‖ label_i)`, `verifyOptionHashes()` (fails closed on mismatch). Uses SDK's `sha256` from `@useaccord/sdk/evidence`.
- **`publish.ts`** — `publishEvidence({endpoint, subaccord, dispute, manifest, operatorPub})` (claimantEncrypt + POST to daemon, idempotent), `verifyManifestHash()` (sha256 gate for recovery upload). `EVIDENCE_DAEMON_URL` constant with `VITE_EVIDENCE_DAEMON_URL` override.
- **`EvidenceEditor.tsx`** — structured form (title, option labels, URL entries). Builds manifest once in `useMemo` (single-buffer invariant), shows YAML preview, manual Download button. `onChange` emits `{manifest, labels, salt}` or null.
- **`index.ts`** — barrel exports.

### CreateDispute.tsx — surgical glue

- `mode` state (`format` | `manual`), default `format`. Mode toggle UI.
- Format mode renders `<EvidenceEditor>` instead of raw option-hash + evidence-hash inputs.
- Dispute PDA derived via `findDisputePda({filer, nonce})` in `useEffect` for manifest ctx.
- `handleSubmit` resolve-branch: format mode → `downloadManifest` (sync, pre-await) → `deriveOptionHashes` + `verifyOptionHashes` + `sha256(manifest)`. Manual mode unchanged.
- **Spine UNCHANGED**: same `createDispute` call structure — only the source of `options` + `evidenceHash` differs by mode.
- Post-`sendInstruction`: `publishEvidence` in format mode. On failure: `publishFail` state with `[Retry publish]` (POST-only, no re-create) + `[View dispute]` buttons.
- Manual mode inputs preserved verbatim (no regression).

### DisputeDetail.tsx — recovery upload

- "Publish evidence" card (shows when round-0 evidence hash is non-zero).
- Hidden file input → `handleUploadManifest` → `verifyManifestHash(sha256(manifest) == evidenceHashes[0])` → `publishEvidence`. Hash mismatch → rejected.

### EVIDENCE-FORMAT.md §3.2

- `entries[].path`: accepts URL or relative POSIX path (MVP broadening).
- `entries[].sha256`: all-zero sentinel documented (juror skips leaf verification; root gate still applies).

### Other

- `vite-env.d.ts`: added `VITE_EVIDENCE_DAEMON_URL`.
- `make lint` green; `pnpm -r run build` green (workspace stays green).
