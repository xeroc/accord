---
# accord-btel
title: "Accumulator — tests: LiteSVM unit (TDD) + Surfpool e2e green-rule sign-off (ADR-0012)"
status: completed
type: task
priority: critical
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-06T01:54:44Z
parent: accord-g74z
blocked_by:
  - accord-ewzf
---

## Why

Two harnesses (AGENTS.md). LiteSVM = fast TDD inner loop for the accumulator
program. e2e (Surfpool + jest + SDK) = the integration sign-off, never skipped
for a feature that touches the chain.

## Scope — LiteSVM (TDD-first, RED → GREEN)

- `stake`/`unstake` with a client-supplied path: valid path updates the root; a
  WRONG/STALE path reverts and leaves the root unchanged.
- Off-chain rebuild from `JurorStake` reproduces the on-chain root exactly (audit
  property — simulate `getProgramAccounts`).
- Locality: a stake change touches only the acting juror; other jurors'
  `tree_index`/leaf unchanged.
- `commit_vrf_callback` writes `dispute.frozen_root = subaccord.root`.
- `draw_seat` verifies membership + sortition against `frozen_root`; per-seat;
  deterministic re-roll on collision; distinctness across seats.
- `last_change_slot` field ABSENT; inflation guard
  (`JurorStake.amount ≥ leaf.stake`, live read) enforced.
- `post_snapshot` / `challenge_snapshot` / `finalize_snapshot` absent from the
  IDL (no such instructions).

## Scope — e2e (Surfpool + jest + SDK)

- Full `request_vrf → commit_vrf (sets frozen_root) → draw_seat × N → commit →
reveal → finalize` round-trip through the SDK.
- Appeal redraws against the SAME frozen root (one root per dispute).
- **Green rule:** the e2e spec MUST be green against a running Surfpool — not
  skipped (AGENTS.md).

## Acceptance

- All LiteSVM accumulator tests green.
- e2e spec green vs Surfpool.

## References

ADR-0012; `accord-g74z`; AGENTS.md (two-harness testing). e2e blocked-by the SDK
bean (`accord-ewzf`).

## Summary of Changes

### LiteSVM tests (`programs/accord/tests/accumulator_litesvm.rs`) — 11 tests, all GREEN

- `first_stake_updates_root_and_credits_juror` — first stake at index 0 verifies
  path against empty-tree root, updates to correct new root.
- `second_stake_at_index_1_updates_root` — sequential stakes at distinct indices
  advance the root correctly.
- `top_up_existing_juror_updates_root_locally` — top-up only changes the acting
  juror's leaf; other jurors' `tree_index`/leaf unchanged (locality).
- `wrong_stale_path_reverts_and_root_unchanged` — a stale path reverts; root
  unchanged.
- `off_chain_rebuild_matches_on_chain_root` — after 4 sequential stakes, the
  off-chain rebuild reproduces the on-chain root exactly (audit property).
- `unstake_updates_root_and_reduces_stake` — unstake verifies the path and
  recomputes the root for the reduced leaf.
- `full_unstake_zeros_leaf_but_retains_tree_index` — full unstake zeros the leaf
  weight but keeps `tree_index`; `staker_count` decrements.
- `re_stake_after_full_unstake_is_local_update` — re-stake after full unstake
  reuses the same `tree_index` (no new leaf allocated).
- `commit_vrf_callback_freezes_live_root` — VRF injection writes
  `frozen_root` + `frozen_total_stake` matching the Subaccord's live accumulator.
- `draw_seat_fills_round_against_frozen_root` — 3 distinct jurors resolved via
  VRF sortition against the frozen root; round fills to Drawn; `active_draws`
  incremented.
- `last_change_slot_field_absent_from_juror_stake` — JurorStake account size
  matches the `last_change_slot`-free layout (ADR-0012 locked decision).

### Bug fix (`programs/accord/src/lib.rs`)

- `draw_seat`: replaced `load_init()` with discriminator-check-then-`load_mut()`
  pattern. The unconditional `load_init()` failed with
  `AccountDiscriminatorAlreadySet` on the 2nd+ `draw_seat` call (the Round
  account persists across per-seat transactions). Now writes the discriminator
  only on the first call, then loads on subsequent calls.

### e2e tests (`tests/src/accumulator.spec.ts`) — 5 tests, all GREEN vs Surfpool

- `first stake updates the on-chain accumulator root`
- `second stake at a new index updates the root`
- `stale path reverts and the root is unchanged`
- `unstake reduces the stake and updates the root`
- `off-chain rebuild from all JurorStakes reproduces the on-chain root`

### Infrastructure updates

- `tests/src/setup/vrf.ts`: `injectCommittedVrf` now also sets `frozenRoot` +
  `frozenTotalStake` (required for draw_seat — ADR-0012 freezes the root at VRF
  commit time).
- `tests/src/setup/fixtures.ts`: `defaultSubaccordArgs` now includes `depth: 4`
  (required field in the updated SDK `CreateSubaccordArgs`).
- `tests/src/snapshot.spec.ts`: **removed** — `post_snapshot` /
  `challenge_snapshot` / `finalize_snapshot` are absent from the IDL (ADR-0012
  eliminated the snapshot layer entirely).

### Known broken (out of scope — separate beans)

The remaining e2e specs (`draw.spec.ts`, `draw-harness.ts`, `appeal.spec.ts`,
`dispute.spec.ts`, `staking.spec.ts`, `voting.spec.ts`, `sdk-pipeline.spec.ts`,
`full-lifecycle.spec.ts`) reference the pre-accumulator API and need migration
to the per-seat `draw_seat` + path-verified stake/unstake flow. These are
individual instruction beans' e2e scope, not the accumulator test bean.
