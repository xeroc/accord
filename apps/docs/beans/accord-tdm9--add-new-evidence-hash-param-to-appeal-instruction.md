---
# accord-tdm9
title: Add new_evidence_hash param to appeal instruction
status: completed
type: task
priority: critical
tags:
  - implementer
created_at: 2026-08-09T16:56:29Z
updated_at: 2026-08-09T16:56:37Z
parent: accord-hoaj
blocked_by:
  - accord-pwa9
---

See milestone accord-qp7c HANDOFF. appeal() gains new_evidence_hash: [u8;32] arg. Write to evidence_hashes[current_round+1]. [0u8;32] sentinel = no new evidence.

## Summary of Changes

- `programs/accord/src/lib.rs`: `appeal` signature → `appeal(ctx, new_evidence_hash: [u8; 32])`. After opening the new round (`current_round = new_round`), writes `dispute.evidence_hashes[new_round as usize] = new_evidence_hash`. No branch for the sentinel — writing `[0u8;32]` leaves the slot zero, which IS the "no new evidence" sentinel (jurors reuse prior rounds'). The `max_appeals` gate guarantees `new_round <= MAX_APPEALS`, so the index is in-bounds and the slot is virgin (sequential per-round writes).
- Doc-comment on `appeal` and `programs/accord/SPEC.md` instruction row updated to document the new arg + sentinel semantics.

Verification: `cargo build` (workspace, exit 0); `cargo test -p accord --features no-entrypoint --no-run` (exit 0); `cargo test -p canon --features no-entrypoint --no-run` (exit 0). No CPI callers of `appeal` exist in the workspace (canon only CPIs `create_dispute`); LiteSVM `appeal`-related tests fabricate state directly rather than invoking the ix, so none needed the new arg. accord-azyd owns the TDD LiteSVM tests for the new behavior.
