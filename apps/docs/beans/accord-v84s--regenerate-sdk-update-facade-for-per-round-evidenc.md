---
# accord-v84s
title: Regenerate SDK + update facade for per-round evidence
status: completed
type: task
priority: high
tags:
  - implementer
created_at: 2026-08-09T16:56:44Z
updated_at: 2026-08-09T20:30:00Z
parent: accord-eifr
blocked_by:
  - accord-pwa9
---

See milestone accord-qp7c HANDOFF. Regenerate Codama client from new IDL. SDK facade: appeal method gains new_evidence_hash param. Update typed account fetchers for Dispute.evidence_hashes.

## Summary of Changes

- **Codama client regenerated** from the post-accord-qp7c IDL (`make codegen`):
  - `generated/accounts/dispute.ts`: `Dispute.evidenceHash` → `Dispute.evidenceHashes: Array<ReadonlyUint8Array>` (fixed size 4, `[[u8;32]; NUM_EVIDENCE_SLOTS]`). The generated `fetchDispute`/`fetchDisputeMaybe` typed fetchers now surface `evidenceHashes` automatically (no hand-written view in the SDK needed — `fetch.ts` re-exports them, `DisputeRulingView` only reads `finalRuling`).
  - `generated/instructions/appeal.ts`: `AppealInstructionData` gains `newEvidenceHash: ReadonlyUint8Array`; both sync + async builders thread the arg.
- **SDK facade `appeal` gains `newEvidenceHash`** (packages/sdk/src/methods/appeal.ts):
  - `appeal()` signature: `+ newEvidenceHash: Uint8Array` (4th arg). Validated via new `assertValidNewEvidenceHash` (32-byte length; `[0u8;32]` sentinel is a legal value = no new evidence that round).
  - `AccordAppealClient.buildAppeal` seam carries `newEvidenceHash`.
  - Bound method `methods.ts` + adapter `adapter.ts#buildAppeal` thread it into the generated `getAppealInstruction`.
- **Downstream callers updated** so the repo compiles:
  - `tests/src/appeal.spec.ts`: 4 `appeal()` call sites pass the `new Uint8Array(32)` sentinel (existing appeal-mechanics/economics/window tests — semantics unchanged; per-round evidence storage is covered by the merged LiteSVM suite).
  - `tests/src/dispute.spec.ts`: filing-hash assertion reads `evidenceHashes[0]` instead of the removed `evidenceHash`.

Verification: `packages/sdk` lint (`tsc --noEmit`) + build clean; `tests/` `tsc --noEmit` clean for all accord specs (canon errors pre-existing/unrelated). SDK unit-test baseline unchanged (4 pre-existing staking/disputePhase failures, identical on clean tree — no new failures).

Out of scope (separate milestone-DoD bean): the evidence daemon (`apps/evidence-daemon/src/chain/reader.ts`) still reads the removed `m.data.evidenceHash` field — its per-round multi-hash delivery is its own deliverable.
