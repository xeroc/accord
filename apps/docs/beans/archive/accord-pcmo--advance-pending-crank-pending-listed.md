---
# accord-pcmo
title: advance_pending crank (Pending → Listed)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T03:50:00Z
parent: accord-6vih
blocked_by:
  - accord-7tsl
---

Target: `programs/canon/src/instructions/advance_pending.rs`.
Change: permissionless `advance_pending(ctx, item)` → require state==Pending and `listing_window` elapsed and not Disputed; Pending → Listed.
Acceptance (TDD): LiteSVM — advances after window; reverts before window; reverts if Disputed.
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #3, §Item state machine.

## Summary of Changes

- `programs/canon/src/instructions/advance_pending.rs` (new): `AdvancePending` accounts struct (permissionless `caller` Signer, PDA-seed-verified `list` for `listing_window`, `mut` PDA-seed-verified `item`) + `handler` — requires `item.state == Pending` (covers `Disputed` and every other non-Pending state), checks `now >= submitted_at + list.listing_window`, flips `Pending` → `Listed`, emits `ItemListed`.
- `programs/canon/src/instructions/mod.rs`: added `advance_pending` submodule; silenced the `ambiguous_glob_reexports` lint (the glob re-exports are required by Anchor's `#[program]` CPI-client codegen; the `handler` fns collide under the glob but are always called fully-qualified from `lib.rs`, so the ambiguity never surfaces).
- `programs/canon/src/errors.rs`: added `NotPending`, `ListingWindowOpen` variants.
- `programs/canon/src/events.rs`: added `ItemListed` event (list, item, account).
- `programs/canon/src/lib.rs`: wired the `advance_pending` dispatcher in `#[program] mod canon`.
- `programs/canon/tests/advance_pending_litesvm.rs` (new): 3 LiteSVM tests — advances after window (listing_window=0 → immediately past), reverts before window (listing_window=1yr → still open), reverts if Disputed (item state overwritten to Disputed post-submit). Reuses `submit_item` to create the Pending item; drives the window via the fabricated `CanonList.listing_window` value (no clock manipulation needed).
- Verify: `cargo test -p canon --features no-entrypoint` → 8/8 LiteSVM tests green (3 advance_pending + 4 submit_item + 1 program-id); `cargo fmt -p canon -- --check` clean; `cargo clippy -p canon --all-features --tests` 0 authored-file warnings.
