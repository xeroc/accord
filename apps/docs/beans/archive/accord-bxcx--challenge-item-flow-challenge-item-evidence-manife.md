---
# accord-bxcx
title: Challenge item flow (challenge_item + evidence manifest)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-t877
---

Challenger authors evidence manifest (title + description markdown + entries) via @useaccord/sdk/evidence → sha256=hash → claimantEncrypt+POST daemon → challengeItem (options are canon-fixed [keep,remove]; lock stake+fee). DoD: item → Disputed; evidence_hash matches; daemon stores bundle. see SPEC §Instructions #4, milestone §1(c).

## Summary of Changes

### Evidence module extraction (ADR-0015 — prerequisite for the challenge flow)

Extracted the `accord-evidence/v1` manifest builder, option-salt derivation,
publish, and parser from `apps/app/src/features/dispute/evidence/` into
`@useaccord/sdk/evidence` (`packages/sdk/src/evidence/`). The SDK evidence
module is now the single source of truth for the evidence wire contract.

New SDK files:

- `packages/sdk/src/evidence/manifest.ts` — `buildManifest` with **NEW `description` field** (YAML literal block scalar, backward-compatible)
- `packages/sdk/src/evidence/options.ts` — `generateSalt`, `deriveOptionHashes`, `verifyOptionHashes`
- `packages/sdk/src/evidence/publish.ts` — `publishEvidence`, `verifyManifestHash`
- `packages/sdk/src/evidence/parse.ts` — `parseManifest`, `optionLabels` (with `description` field support)
- `packages/sdk/src/evidence/index.ts` — barrel updated to export all

### apps/app migration

Deleted local `manifest.ts`, `options.ts`, `parse.ts`. `publish.ts` reduced to
the Vite env-backed `EVIDENCE_DAEMON_URL` constant + re-export from SDK.
`index.ts`, `EvidenceEditor.tsx`, `EvidenceManifest.tsx`, `evidence.test.ts`
updated to import from `@useaccord/sdk/evidence`. All 18 tests pass.

### Description field (ADR-0017)

Added `description` (optional markdown) to `accord-evidence/v1`:

- Builder: emits `description: |` (YAML literal block) when present; omitted entirely when absent
- Parser: reads the literal block body
- EVIDENCE-FORMAT.md: annotated example + field reference table updated
- 4 new tests in apps/app prove byte-stability, backward-compat, and hash-sensitivity

### Canon challenge feature (apps/canon)

Created `apps/canon` (`@useaccord/canon-app`) — minimal Vite + React + Tailwind v4
scaffold mirroring apps/app (dark-only, ink/amber, Plex). The challenge feature:

- `features/challenge/challengeFlow.ts` — `prepareChallengeEvidence` (build manifest → sha256 → publish to daemon) + `buildChallengeInstruction` (derive all accounts: dispute PDA, pause state, ATAs → `challengeItem` instruction)
- `features/challenge/ChallengePage.tsx` — challenger's evidence authoring UI (title + markdown description textarea + evidence URLs), YAML preview, full submit flow (fetch chain data → build manifest → hash → publish → send challengeItem)
- `features/challenge/challenge.test.ts` — 5 tests proving: description YAML format, evidence_hash == sha256(manifest), description changes hash, canon-fixed options [keep,remove], committed bytes integrity

Canon options are FIXED `[keep, remove]` — the challenger never authors option labels; the description IS the claim body.

### Verification

- Workspace lint: green (all packages + apps)
- Workspace build: green (all packages + apps)
- SDK tests: 89 pass
- apps/app tests: 18 pass (14 original + 4 new description tests)
- apps/canon tests: 5 pass (challenge evidence flow)
