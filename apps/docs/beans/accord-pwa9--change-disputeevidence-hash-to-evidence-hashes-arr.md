---
# accord-pwa9
title: Change Dispute.evidence_hash to evidence_hashes array
status: completed
type: task
priority: critical
tags:
  - implementer
created_at: 2026-08-09T16:56:29Z
updated_at: 2026-08-09T16:56:29Z
parent: accord-hoaj
---

See milestone accord-qp7c HANDOFF. Replace evidence_hash: [u8;32] with evidence_hashes: [[u8;32]; MAX_APPEALS+1]. Write evidence_hashes[0] in create_dispute. Update all reads.

## Summary of Changes

- `programs/accord/src/state.rs`: `Dispute.evidence_hash: [u8;32]` → `Dispute.evidence_hashes: [[u8;32]; MAX_APPEALS+1]` (imports `MAX_APPEALS`); doc-comment notes per-round layout + `[0u8;32]` sentinel.
- `programs/accord/src/lib.rs`: `create_dispute` now writes `d.evidence_hashes[0] = evidence_hash`. The instruction arg `evidence_hash: [u8;32]` is deliberately kept (per HANDOFF — `appeal`'s `new_evidence_hash` param is accord-tdm9; the `#[instruction]` attr stays unchanged).
- `programs/canon/src/instructions/settle_item.rs`: layout-coupled zero-copy reads — `DISPUTE_STATE_OFFSET` 1137→1233, `DISPUTE_RULING_OFFSET` 1198→1294 (+96 bytes from the 3×32 array growth).
- `programs/canon/tests/settle_item_litesvm.rs`: synced the raw-bytes fixture (`data[1233]`/`data[1294]`), the `dispute_borsh_offsets_are_correct` assertions, and the `Dispute` struct literal (`evidence_hashes` array, round-0 set).
- `programs/canon/tests/challenge_item_litesvm.rs`: `dispute.evidence_hash` → `dispute.evidence_hashes[0]`.
- `programs/accord/SPEC.md`: `Dispute` field listing updated to `evidence_hashes: [[u8;32]; MAX_APPEALS+1]`.

Verification: `cargo build` (workspace, clean); `cargo test -p accord --features no-entrypoint --no-run` (exit 0); `cargo test -p canon --features no-entrypoint --test settle_item_litesvm dispute_borsh_offsets_are_correct` — 1 passed (offset shift +96 confirmed against real borsh). No new warnings introduced. SDK/ADR-0023/evidence-daemon/e2e remain for accord-eifr / accord-tdm9 / accord-azyd.
