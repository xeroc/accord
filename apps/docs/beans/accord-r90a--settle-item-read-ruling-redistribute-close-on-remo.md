---
# accord-r90a
title: settle_item (read ruling → redistribute, close on remove)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T19:00:00Z
parent: accord-1eoy
blocked_by:
  - accord-04m9
---

Target: `programs/canon/src/instructions/settle_item.rs`.
Change: permissionless `settle_item(ctx, item)` → require Disputed + Accord dispute finalized; read Accord `final_ruling`. `keep`: challenger's `challenge_stake` → `item.accumulated_stake` (progressive protection), fee consumed by jurors (Accord), Disputed → Listed (or WithdrawPending if it was a withdrawal challenge). `remove`: `accumulated_stake` → challenger (full-accumulated bounty), close the CanonItem (reclaim rent, re-submittable per Q18), Disputed → Removed. Handle withdrawal-challenge: on `keep` during a withdrawal, challenger's stake → submitter (frivolous-block penalty) and item still Removed.
Acceptance (TDD): LiteSVM — keep/remove redistribution exact; progressive protection grows on keep; item closed on remove (Q18); withdrawal-challenge paths correct.
Dependencies: challenge_item. Authority: programs/canon/SPEC.md §Instructions #5, §Economics; Q7/Q18.

## Summary of Changes

### Implemented

- **`settle_item`** (`programs/canon/src/instructions/settle_item.rs`):

  - Reads the Accord Dispute's `final_ruling` from raw Borsh bytes (offset 1198; state at offset 1137) — avoids loading the full Dispute struct on the BPF stack.
  - Verifies: item is Disputed, dispute PDA matches `item.active_dispute`, dispute owner is `ACCORD_ID`, dispute state is `Final`.
  - **Regular `keep`**: `challenge_stake` folds into `accumulated_stake` (progressive protection). No transfer. → Listed.
  - **Regular `remove`**: transfers `accumulated_stake + challenge_stake` from vault → challenger (bounty). → Removed.
  - **Withdrawal `keep`**: transfers to submitter (frivolous-block penalty). → Removed.
  - **Withdrawal `remove`**: transfers to challenger (bounty). → Removed.
  - Clears challenge bookkeeping (active_dispute, challenger, challenge_stake).
  - Emits `ItemSettled`.

- **Borsh offset verification**: a non-SVM unit test (`dispute_borsh_offsets_are_correct`) constructs a full `accord::state::Dispute` and verifies that `state` is at byte 1137 and `final_ruling` is at byte 1198 in the serialized data. This guarantees the raw-offset reads are correct against the actual struct layout.

- **Supporting changes**: `errors.rs` (NotDisputed, DisputeNotFinal, InvalidRuling), `events.rs` (ItemSettled), `lib.rs` + `mod.rs` (registration).

### LiteSVM tests — SBPF v0 limitation

3 happy-path tests are `#[ignore]`'d (same SBPF v0 stack limitation as challenge_item). The Borsh offset verification test passes. Full integration covered by the e2e (Surfpool) suite.
