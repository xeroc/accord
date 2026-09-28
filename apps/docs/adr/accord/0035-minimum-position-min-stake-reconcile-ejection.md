# Minimum juror position = min_stake; reconcile ejects below-floor jurors (amends the REVIEW #5 draw gate)

Date: 2026-09-28 · Status: accepted · Bean: accord-hp0c

## Context

Since REVIEW #5 (f6a141a) `draw_seat` required free stake — `staked − slash_reserve` —
to cover `min_stake + α·min_stake` before reserving this draw's `α·min_stake` bond, and
`stake` (b72fb0c1, after the devnet undrawable-dispute incident) floored the
leaf-creating deposit at the same `min + α`. The effect: the smallest drawable position
was `min_stake + α·min_stake`, and a juror slashed exactly once at that minimum landed
*at* the floor — still a member, excluded from draws only until an `α` top-up.

Fabian's call (2026-09-28): that buffer is not wanted. **A juror must be drawable with
exactly `min_stake`.** An incoherent vote should make the juror ineligible *by dropping
them below the floor* — ejection is the intended outcome, not a state to cushion. The
pilot's `α = 100%` corner is explicitly not special-cased.

## Decision

1. **Draw gate:** `free_stake = staked − slash_reserve ≥ min_stake` (the `+ α·min_stake`
   term is dropped). The per-draw `α·min_stake` bond still increments `slash_reserve` —
   the reservation, not the gate, is what guarantees `staked ≥ Σα_pending`, so every
   pending slash remains fully covered and the settle cap `min(slash, staked)` stays a
   no-op on the canonical ledger.
2. **Opening gate:** the leaf-creating deposit must be `≥ min_stake` (top-ups ungated).
   A below-floor first deposit is born sortition dust — positive weight, undrawable —
   so it reverts and consumes no leaf.
3. **Clean ejection at `reconcile_stake`:** a fold landing strictly between `0` and
   `min_stake` ejects the juror. The leaf is written at **zero weight** (an empty
   sortition range — selection becomes structurally impossible), the remainder is banked
   into `pending_withdrawal` on the existing two-phase rail (payable after
   `WITHDRAWAL_DELAY` + `active_draws == 0`), `staker_count` decrements (the
   `request_withdraw` full-exit mirror), and `Unstaked` is emitted. A fold to exactly
   `0` (α = 100%) or to `≥ min_stake` keeps the plain fold.

## Why the ejection exists (the SR3-H-1 coupling)

Eligibility-by-inequality alone (`stake < min_stake ⇒ ineligible`) leaves the slashed
juror's leaf in the accumulator **below the floor but with positive weight**. Frozen
sortition cannot skip a leaf (the collision re-roll only skips already-drawn seats;
SR3-H-1's proof-of-undrawable skip is still open) — a VRF landing on such a leaf
reverts `draw_seat` and the seat deadlocks into the 3-day pre-draw cancel. Zeroing the
leaf at the fold point means the slash path never mints that dead zone. (Partial
withdrawals below the floor remain a dust source until SR3-H-1 lands — unchanged.)

## Consequences

- The smallest juror position halves wherever `α = 100%` (`2·min_stake → min_stake`).
- The stale-window exposure (`stake_delta` invisible to `staked` until the
  permissionless reconcile runs) is unchanged in kind, one `α` cheaper in attacker
  capital — the reconcile-before-exit invariant (`request_withdraw` requires
  `stake_delta == 0`) is the systemic backstop either way.
- ADR-0021's repeat-offender exclusion mechanism is now the ejection, not the gate.
- No IDL change (no signatures/accounts/events added); no codegen ripple. The qedspec
  models no gate arithmetic — `slash_bounded` is preserved (the slash amount itself is
  untouched; ejection moves the remainder, it does not destroy accounting).
- Consumers that mirror the threshold: `apps/app` juror `StakePage` (updated in the
  same change). The riprap pilot pins this repo by `rev`; its §12 numbers and landing
  surface move on the next pin bump.
