---
# accord-azyd
title: LiteSVM TDD tests for per-round evidence
status: completed
type: task
priority: high
tags:
  - tester
created_at: 2026-08-09T16:56:29Z
updated_at: 2026-08-09T16:56:37Z
parent: accord-hoaj
blocked_by:
  - accord-tdm9
---

See milestone accord-qp7c HANDOFF §6. Test matrix: round-0 hash stored at filing, appeal writes new hash to correct slot, sentinel skips, max_appeals still bounds slots, multi-round accumulation.

## Summary of Changes

### Tests (matrix §6.1–§6.4, on-chain items; §6.5 daemon delivery is off-chain)

Added 4 LiteSVM tests in `programs/accord/tests/accumulator_litesvm.rs` + shared helpers (`arm_n_stakers`, `create_dispute_with_evidence`, `read_dispute`, `fabricate_resolved_round`, `force_round_resolved`, `fund_appellant`, `do_appeal`):

- `create_dispute_stores_round0_evidence_hash` — §6.1: filed hash at `[0]`, `[1..=3]` zero.
- `appeal_writes_new_evidence_hash_to_next_round_slot` — §6.2: appeal slots new hash at `[round+1]`, advances `current_round`, prior slot untouched.
- `appeal_sentinel_evidence_hash_leaves_slot_zero` — §6.3: `[0u8;32]` appeal leaves new slot zero (sentinel = reuse prior).
- `appeal_beyond_max_appeals_rejected` — §6.4: appeal past `max_appeals` fails `MaxAppealsReached`, no slot written.

The appeal tests execute the REAL `appeal` instruction (not fabrication): fabricate only the preconditions (dispute `RoundResolved` + a resolved `Round` account with `result`/`reveal_end`), then run `appeal(new_evidence_hash)` end-to-end and assert the slot write.

### Regression fix (carried here — unblocks the whole dispute suite)

`Dispute.evidence_hashes` was declared `[[u8; 32]; MAX_APPEALS + 1]` (accord-pwa9). Anchor's `InitSpace` + borsh derives **silently undercount** an array whose length is a binary const expression (`MAX_APPEALS + 1`): the declared `INIT_SPACE` is smaller than the real borsh size, so `init` allocates an undersized account and the dispute fails to deserialize — breaking **all 22 dispute-lifecycle LiteSVM tests** (every create_dispute/draw/round/appeal/settle test), not just the new ones. Reproduced on a5b6482 (pre-regression) → pass; a45879c (introduces the array) → fail.
Fix: introduce `NUM_EVIDENCE_SLOTS: usize = MAX_APPEALS + 1` as a named const (`programs/accord/src/constants.rs`) and size the array off the single ident — mirroring how `MAX_OPTIONS`/`MAX_JURORS` already work. `state.rs` and `SPEC.md` updated to reference it.

### Verification

- `cargo build` (workspace): exit 0.
- `cargo build-sbf --tools-version v1.52` (programs/accord): fresh `.so`.
- `cargo test -p accord --features no-entrypoint`: accumulator_litesvm **48 passed**, health_litesvm **1**, pause_litesvm **4** — full suite GREEN (was 22/44 before the regression fix).
- `cargo test -p canon --features no-entrypoint --test settle_item_litesvm dispute_borsh_offsets_are_correct`: 1 passed (offsets still hold — NUM_EVIDENCE_SLOTS == MAX_APPEALS+1, same 96-byte growth).
- Pre-commit (fmt + cargo check): green.
