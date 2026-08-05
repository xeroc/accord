---
# accord-btel
title: 'Accumulator — tests: LiteSVM unit (TDD) + Surfpool e2e green-rule sign-off (ADR-0012)'
status: todo
type: task
priority: critical
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T17:12:02Z
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
