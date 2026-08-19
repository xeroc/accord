---
# accord-6r0j
title: Resolve security review H-1/H-2/H-3 (reclaim gate, cancel probe, creation bounds)
status: completed
type: task
priority: normal
created_at: 2026-08-19T01:06:55Z
updated_at: 2026-08-19T02:58:09Z
---

Fix the three High findings from reports/2026-08-19-accord-security-review.md: H-1 reclaim_slot missing pending_withdrawal gate (+ defense-in-depth in stake free-list pop); H-2 pre-draw cancel_dispute optional partial-round probe; H-3 create_subaccord missing update-path domain bounds. TDD: red tests first (LiteSVM + e2e), then fix, docs updated, no IDL/signature changes.

## Summary of Changes

**H-1** (reclaim gate): `reclaim_slot` now requires `pending_withdrawal == 0` (mirror of `request_withdraw`/`prune_juror`); defense-in-depth check added to the `stake` free-list pop. Red→green: `reclaim_litesvm.rs :: reclaim_slot_rejects_pending_withdrawal`.

**H-2** (cancel probe): new `Dispute.drawn_seats: u32` carved from `padding` (size/offsets unchanged), mirrored by `draw_seat`, reset by `appeal`/`redraw`. Pre-draw `cancel_dispute` requires Round + JurorStake remaining-accounts when `drawn_seats > 0`. Red→green: e2e `draw.spec.ts :: H-2` (griefer omission reverts, well-formed cancel releases).

**H-3** (creation bounds): `create_subaccord` mirrors `validate_update_payload` — alpha ≤ 10_000, min_stake > 0, windows > 0, MAX_JURORS·fee_per_juror overflow bound. Red→green: `min_jury_size_litesvm.rs` creation-bounds suite (4 tests).

Coupling handled: codegen (drawnSeats in sdk + synod generated types; InvalidThreshold msg), cranker Dispute fixtures (+drawnSeats), SPEC.md + apps/docs accounts.md + security-checklist.md + lib.rs docs, report addendum.

Incidental: Makefile `test_unit` now passes `--features accord/no-entrypoint` (bare `cargo test` silently skipped all LiteSVM suites); fixed pre-existing red `fabricate_appeal_bond` (93-byte account, no padding tail → AccountDidNotDeserialize).

Verification: make test_unit (123 LiteSVM green), make test (anchor test, fresh Surfpool: 25 suites / 102 e2e green), pnpm -r build+lint green, pnpm -r test green (sdk 98, cli 119, cranker 87, app 37, canon 58, synod 64 — 0 fail). No commit made.

Open: M-1..L-6 from the review remain (separate beans if wanted).
