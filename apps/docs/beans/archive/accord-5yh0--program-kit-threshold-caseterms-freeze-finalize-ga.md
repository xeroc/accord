---
# accord-5yh0
title: "Program: kit threshold + CaseTerms freeze + finalize gate + redraw + draw_attempt + Failed"
status: completed
type: task
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T21:30:00Z
parent: accord-z8jp
blocked_by:
  - accord-djzb
---

assigned: implementer. See HANDOFF §2/§4. Files: state.rs (Subaccord reveal_threshold_bps/shortfall_policy/max_draw_attempts; CaseTerms freeze; Round +draw_attempt), lib.rs (finalize_round threshold gate + fees_earned credit; new redraw crank slashing no-shows to stake_delta; draw_seat seed +draw_attempt; max_draw_attempts→Failed refund), errors.rs, events.rs, constants.rs.

## Blocker (cleared 2026-08-07T19:05:00Z)

accord-djzb (E1) is completed. Verified codebase: `JurorStake.staked`/`stake_delta`/`fees_earned`, `Subaccord.fee_token`, `fee_vault`/`stake_vault` all present. E2 unblocked — implemented below.

(Historical: this bean was hard-blocked on `accord-djzb` for `JurorStake.fees_earned`, the `settlement_delta → stake_delta` rename, and the dual-vault fee refund path — all E1-owned. Resolved when djzb landed.)

## Summary of Changes

ADR-0021 E2 program implementation — reveal-quorum threshold + shortfall redraw
via an orthogonal `draw_attempt` (distinct from `round_idx`), with
`max_draw_attempts → Failed` exhaustion.

### state.rs

- `ShortfallPolicy` enum (v1 single variant `Redraw`).
- `Subaccord`: +`reveal_threshold_bps: u16`, +`shortfall_policy: ShortfallPolicy`, +`max_draw_attempts: u8` (kit config, grouped with `max_appeals`/`aggregation`).
- `CaseTerms`: +same 3 fields (frozen at `create_dispute`, Ugly-6).
- `CreateSubaccordParams`: +same 3 fields (the kit-config surface).
- `Round`: +`draw_attempt: u32` **appended at the end** (with `_pad_draw_attempt`
  for Pod 8-byte alignment) so all existing field offsets are stable — zero
  ripple to the offset-coupled `remaining_accounts` slicing in cancel/settle.
- `DisputeState`: +`RedrawEligible` (appended after `Failed`; append-safe Borsh
  discriminant).

### lib.rs

- `create_subaccord`: accepts + validates (`threshold ≤ 10_000`,
  `1 ≤ max_draw_attempts ≤ MAX_DRAW_ATTEMPTS`) + stores the 3 new params.
- `create_dispute`: freezes the 3 new fields into `CaseTerms`.
- `finalize_round` — **threshold gate**: computes
  `needed = ceil(panel × reveal_threshold_bps / 10_000)`. If `reveal_count ≥
needed` → tally + credit `fees_earned` + decrement `fee_paid` + `RoundResolved`
  (E1 path, now quorum-gated). Else → no credits, no result, `RedrawEligible`.
- `draw_seat`: sortition seed gains the `draw_attempt` dimension
  (`hashv(&[committed_vrf, dispute, round_idx, draw_attempt])`), so a redraw
  selects fresh seats without advancing `round_idx`.
- **NEW `redraw`** crank (permissionless, `RedrawEligible` only):
  - Pass 1: slashes no-shows into `stake_delta` (pending, not `staked` → frozen-
    root inflation guard still passes), releases every drawn juror's
    `active_draws` + `slash_reserve` for the failed round.
  - **Redraw branch** (`draw_attempt+1 < max_draw_attempts`): bumps
    `draw_attempt`, clears the round (jurors/commits/reveals/seat_prefix/
    seat_stake + window deadlines), re-opens `Created`. `round_idx` + panel size
    unchanged.
  - **Fail branch** (`draw_attempt+1 ≥ max_draw_attempts`): releases prior appeal
    rounds' `active_draws` (via `release_prior_rounds`), refunds the filer's
    `dispute.fee_paid` (per-dispute, vault-safe for the shared fee_vault per the
    ADR-0020 invariant), → terminal `Failed`. No-shows' slashes stand; bonds stay
    claimable via `claim_appeal_refund`.
- New `Redraw` account context (mirrors `CancelDispute`'s token-account shape).

### errors.rs

- `NotRedrawEligible`, `MaxDrawAttemptsLimitExceeded`, `InvalidThreshold`.

### events.rs

- `Redrawn { dispute, round_idx, draw_attempt }`,
  `DisputeFailedShortfall { dispute, filer, draw_attempt, refund }`.

### constants.rs

- `DEFAULT_REVEAL_THRESHOLD_BPS` (6666 = 2/3), `DEFAULT_MAX_DRAW_ATTEMPTS` (3),
  `MAX_DRAW_ATTEMPTS` (program ceiling = 10).

### tests/accumulator_litesvm.rs (minimal compile/seed fixes — not TDD scope)

- Added the 3 new fields to the 3 `CreateSubaccordParams` construction sites
  (default threshold 6666 ⇒ the existing 2-of-3 reveal finalize test still meets
  quorum).
- Updated the off-chain sortition-seed recomputation at all draw-seat sites to
  include `draw_attempt` (=0 for first draw), matching the on-chain seed.
- The new-instruction TDD (threshold-met, shortfall→redraw, slash accumulation,
  Failed, repeat-offender) is sibling bean **accord-84vk**; the SDK config +
  `redraw` instruction is **accord-he1u**; Surfpool e2e is **accord-rcem**.

### Verification

- `anchor build --ignore-keys`: clean (`.so` + IDL regenerated with `redraw`,
  `draw_attempt`, `ShortfallPolicy`, `RedrawEligible`, new errors/events).
- `make test_unit`: 7 lib + 31 accumulator_litesvm + 1 health + 4 pause = **43/43 green**.
- `make lint`: clean.

### Notes / Deferred

- `assert_fund_invariants()` (milestone DoD) was not wired by E1 and spans both
  epics; this bean preserves the fund invariant **by construction** (ledger-only
  slashes via `stake_delta`; `fee_vault` touched only by the per-dispute
  `fee_paid` refund on `Failed`). Wiring the explicit assertion is a follow-up.
- The Fail-branch filer refund uses `dispute.fee_paid` (ADR-0021 wording),
  vault-safe for the shared per-Subaccord `fee_vault`.
