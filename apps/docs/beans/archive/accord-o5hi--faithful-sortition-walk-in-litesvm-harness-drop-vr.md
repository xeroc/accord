---
# accord-o5hi
title: Faithful sortition walk in LiteSVM harness — drop VRF brute-force, fix redraw tx-dedup flakiness
status: completed
type: bug
priority: high
created_at: 2026-08-09T23:37:24Z
updated_at: 2026-08-09T23:49:43Z
---

setup_and_finalize brute-forces a collision-free VRF because submit_draw_seat only emits retries=0. redraw_seed_advances_with_draw_attempt then re-resolves at draw_attempt=1 with retries=0 and, when the redrawn leaf matches the initial (seat,leaf), produces a byte-identical tx → LiteSVM AlreadyProcessed (flaky).

Fix:

- submit_draw_seat: fresh funded caller per call (mirrors :3592 caller2 pattern) → global tx-dedup fix.
- New submit_draw_panel helper: walks retry in 0..=MAX_SORTITION_RETRIES, skips already-drawn leaves, mirrors on-chain draw_seat sortition exactly.
- setup_and_finalize: random VRF + submit_draw_panel (drop brute-force loop at :3773-3788).
- redraw_seed_advances_with_draw_attempt: submit_draw_panel at draw_attempt=1 (drop the if-distinct skip at :4129-4152).

Out of scope: the local brute-force inside slash_reserve_blocks_draw_when_insufficient_free_stake (:3559) — works, leave it; follow-up.

TDD: RED = redraw_seed_advances_with_draw_attempt flaky in full suite; GREEN = N consecutive full-suite runs green.

## Summary of Changes

Root cause: `submit_draw_seat` pinned `env.creator` as caller+signer; LiteSVM never auto-advances the blockhash, so two byte-identical instructions collide as `AlreadyProcessed`. The brute-force in `setup_and_finalize` was a workaround for a *different* problem (avoiding sortition collisions at retry=0), but it only covered draw_attempt=0 — the redraw test re-resolved at draw_attempt=1 with retries=0 and best-effort `if distinct`, so when the redrawn leaf matched the initial (seat, leaf), the tx collided. Two issues, one fix surface.

### Changes (`programs/accord/tests/accumulator_litesvm.rs`)

1. **`submit_draw_seat`** — fresh funded `Keypair` per call as caller+signer (mirrors the established :3592 `caller2` pattern). `DrawSeat`'s `caller` is payer/signer only; the program stores nothing caller-specific, so this is safe. Kills tx-dedup globally for every caller of `submit_draw_seat`.

2. **New `submit_draw_panel`** helper — resolves `n_seats` distinct jurors by walking `retry in 0..=MAX_SORTITION_RETRIES` and skipping already-drawn leaves (exact mirror of the on-chain `draw_seat` sortition at lib.rs:1062-1086). Returns `Vec<(seat, leaf_idx, retries)>`.

3. **`setup_and_finalize`** — dropped the 16-line VRF brute-force loop; any random VRF works now (uses the dispute PDA bytes as a deterministic-per-test seed). Calls `submit_draw_panel` for the initial 3-seat draw. Removed now-orphaned `total`/`prefixes` locals and the `DrawnDispute.total`/`prefixes` struct fields (only the redraw test read them, and it no longer does).

4. **`redraw_seed_advances_with_draw_attempt`** — replaced the manual per-seat loop + `if distinct` skip with a single `submit_draw_panel` call at draw_attempt=1. The panel now ALWAYS fills (collisions resolved via retries), so the `juror_count == 3` + `draw_attempt == 1` asserts run unconditionally.

### Coverage gained

The on-chain retry path (`lib.rs:1062-1086`, the anti-cherry-pick `SortitionMismatch` branch + `DuplicateJuror` guard) is now exercised on every `setup_and_finalize` and redraw test, not just the dedicated `draw_seat_collision_re_roll_resolves_without_caller_choice`.

### Verification

- `cargo test --features no-entrypoint`: 48/48 accumulator_litesvm + 7 lib + 1 health + 4 pause = 60 green.
- `make test_unit`: green (canonical flow, rebuilds the .so).
- Flakiness proof: **10/10** consecutive full-suite runs green (was previously failing non-deterministically with `AlreadyProcessed`).
- Clippy: 5 pre-existing warnings, 0 new (`#[allow(clippy::too_many_arguments)]` on `submit_draw_panel` per the `lib.rs:2395` convention).

### Out of scope (follow-up)

- The local brute-force inside `slash_reserve_blocks_draw_when_insufficient_free_stake` (:3559) — works, leave it; it tests a failure path and the brute-force there is for a different purpose (forcing a specific juror selection).

### Doc reconciliation

- `accord-84vk` bean item #5: updated "(when the VRF yields 3 distinct seats)" → "via the faithful retry walk (submit_draw_panel), collisions and all" (the old parenthetical described the now-removed `if distinct` skip).
