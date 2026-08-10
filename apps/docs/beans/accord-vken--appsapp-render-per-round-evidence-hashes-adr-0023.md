---
# accord-vken
title: apps/app — render per-round evidence hashes (ADR-0023)
status: completed
type: task
priority: normal
created_at: 2026-08-09T22:56:56Z
updated_at: 2026-08-09T23:04:58Z
parent: accord-uvru
---

DisputeDetail.tsx consumes dispute.data.evidenceHashes (Array) but renders nothing for evidence. Add per-round Evidence section.

## Todos

- [ ] Add Evidence (per round) section to DisputeDetail.tsx — render evidenceHashes[0..=currentRound], sentinel handling
- [x] typecheck net-zero new errors (8 baseline pre-existing; lint script error TS5094: Compiler option '--noEmit' may not be used with '--build'. is broken — TS5094 — separate fix)

## Summary of Changes

### apps/app/src/features/dispute/DisputeDetail.tsx

- Added an **Evidence (per round)** section rendering `dispute.data.evidenceHashes` (ADR-0023: `Array<ReadonlyUint8Array>`, 4 slots = MAX_APPEALS+1).
- Shows slots `[0..=currentRound]` only (future slots are zero-initialized, irrelevant). Each non-zero slot → round label + `Copyable` hash (matches the sibling Options section pattern). A `[0u8;32]` sentinel renders as "no new evidence — reuses prior rounds".
- Header gives a filed-package count through the current round; footer notes that round-N jurors receive every non-zero package 0..=N.
- Typed the two new `.every((b: number) => ...)` callbacks to keep net typecheck errors at the pre-existing baseline (8).

### NOT changed (by design — ADR-0023 §2)

- `CreateDispute.tsx`: the filer's `create_dispute` arg is intentionally a SINGLE `evidenceHash: [u8;32]`, stored at `evidence_hashes[0]` on-chain. The SDK `createDispute` method signature already reflects this. No change needed — the create path is already array-correct (one in, slot 0).
- `useDispute.ts` / `useAppeal.ts`: consume the SDK types directly (`evidenceHashes` is already on the decoded `Dispute`); no field reads changed.

### Scope note / future work

- The on-chain `create_dispute` does NOT yet enforce non-zero on round-0 (ADR-0023 §4 calls it a requirement; `lib.rs:818` stores verbatim, no gate). So `CreateDispute.tsx`'s all-zeros default still submits successfully. Not fixed here — it's a program-side gate, not an app concern.
- Appeal UI (`DisputeDetail.tsx` appeal button) is disabled (`ponytail: appeal tx needs ConnectorKit signer — accord-y5av`). ADR-0023 §3 adds `new_evidence_hash` to `appeal`; when wired, the appeal form will need a hash input field (sentinel-allowed). Out of scope for this array-awareness pass.
- Pre-existing: `apps/app` lint script is `tsc -b --noEmit` which is invalid (TS5094) — it never actually type-checks. That's why 8 baseline errors shipped. Worth a separate bean to fix the script + clear the baseline.
