---
# accord-d72d
title: "Review: DisputeDetail recovery — additive only, no existing detail-page logic changed"
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T05:47:00Z
parent: accord-wbic
blocked_by:
  - accord-6fgl
---

Confirm the new section is purely additive; existing DisputeDetail logic untouched. See HANDOFF §5.

## Summary of Changes

**Review verdict: PASS.** The `DisputeDetail.tsx` change (commit `131620a`) is
purely additive — existing detail-page logic is untouched. No code changes
were required by this review.

### Findings

- **`git diff --numstat` vs origin/develop:** `6 0` on
  `apps/app/src/features/dispute/DisputeDetail.tsx` — **6 additions, 0
  deletions, 0 modifications** to existing lines. The two additions are:
  1. One import line: `import { PublishEvidence } from "./evidence/PublishEvidence";`
  2. One guarded JSX block after the evidence-hash panel:
     `{subaccord && <PublishEvidence dispute={dispute} subaccord={subaccord} />}`
- **No existing state, handlers, or render branches were modified.** The
  cumulative diff has zero `-` lines; every existing line is byte-identical to
  origin/develop. (A transient Prettier reformat of the long `VRF` `InfoRow`
  line was caught and reverted before the commit landed — not present in the
  committed diff.)
- **No evidence domain logic leaks into `DisputeDetail.tsx`.** Grep for
  `claimantEncrypt`, `publishEvidence`, `verifyManifestHash`, `sha256`,
  `evidenceOperator`, `ECIES`, `encrypt` in the file returns nothing — all
  domain logic is isolated in `features/dispute/evidence/` (`publish.ts`,
  `PublishEvidence.tsx`), satisfying HANDOFF §5 / DoD bullet 1.
- **Insertion point is benign:** the new block sits between the per-round
  evidence-hash IIFE and the "Final ruling" block, guarded by `subaccord`
  (handles the loading state). It does not reorder or gate any existing section.

### Verification (re-run as reviewer)

- `pnpm --filter @useaccord/app run lint` — green (`tsc -b --noEmit`).
- `pnpm --filter @useaccord/app run test` — 6 pass, 0 fail (the recovery suite
  from `accord-6fgl`).
- `make lint` — green across all 8 workspace projects (confirmed in the
  preceding bean).

No remediation needed.
