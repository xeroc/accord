---
# accord-vsyq
title: Two-mint/two-vault economics + reveal-quorum shortfall redraw
status: todo
type: milestone
priority: high
created_at: 2026-08-07T18:07:44Z
updated_at: 2026-08-07T18:07:44Z
---

Two coupled economics changes resolved in the 2026-08-07 grilling. **ADR-0020** splits
collateral (`stake_token`) from compensation (`fee_token`) into two mints + two vaults with a
`fees_earned` aggregate ledger. **ADR-0021** adds a reveal-quorum threshold and a same-size
shortfall-redraw path via an orthogonal `draw_attempt`. Epic E1 (two-mint) ships first; Epic E2
(quorum/redraw) builds on it — it depends on `fees_earned`, `stake_delta`, and the threshold-gated
fee credit.

**Read ADR-0020 and ADR-0021 (`apps/docs/adr/accord/`) before touching anything — they are the
authority.** Coordinate with bean `accord-8m2a` (ADR-0019): both this work and 8m2a extend the
`Subaccord`/`CaseTerms` struct; whoever lands first establishes field order, the other adapts. The
full target struct layout is in §2 below.

## HANDOFF

### 1. Happy Path

**Stake:** juror `stake` → `stake_vault` (Subaccord PDA ATA of `stake_token`); accumulator root
updated. **Create dispute:** filer `create_dispute` pays `panel × fee_per_juror` of `fee_token`
into `fee_vault`; `dispute.fee_paid` = that pool. **Draw/commit/reveal:** unchanged mechanics, but
`reveal` records the vote ONLY (no fee, no ATA, no SPL transfer). **Finalize round:** if
`reveal_count ≥ ceil(panel × threshold_bps/10000)` → credit each revealer `fees_earned +=
fee_per_juror`, set `result`, → `RoundResolved`. Else → no credits, redraw-eligible. **Shortfall
redraw:** permissionless `redraw` slashes no-shows (`stake_delta -= α·min_stake`,
`slash_reserve -= α·min_stake`, `active_draws--`), bumps `Round.draw_attempt`, clears the round,
re-opens `Created`. **Settle:** `stake_delta` (slash proceeds → coherent) + `fees_earned` (forfeited
fees+bonds → coherent) written to the `juror_stake` accounts already passed. **Withdraw fees:**
juror `withdraw_fees` pulls aggregate `fees_earned` from `fee_vault` → juror `fee_token` ATA, no
gate. **Failed:** `max_draw_attempts` exhausted → refund `dispute.fee_paid` + bonds; slashes stand.

### 2. Data Contract

- `Subaccord`: `staking_token: Pubkey` (collateral mint, KEPT), **`fee_token: Pubkey` (NEW,
  compensation mint)**, **`reveal_threshold_bps: u16`** (e.g. 6666), **`shortfall_policy:
  ShortfallPolicy`** (enum, v1 `Redraw`), **`max_draw_attempts: u8`** (default 3). Plus ADR-0019's
  `aggregation` + `initial_num_jurors` (from accord-8m2a — coordinate field order).
- `JurorStake`: rename `amount → staked`, `settlement_delta → stake_delta`; **add `fees_earned:
  u64`**. Existing `active_draws`, `slash_reserve`, `pending_withdrawal`,
  `withdraw_requested_at`, `tree_index`, `bump` unchanged. +8 bytes ⇒ update `layout::JS_*_OFF`
  consts and `layout_tests::offsets_match_borsh`.
- `Dispute`: `fee_paid: u64` semantic shift → **running available fee pool** (decremented on earn,
  incremented on appeal fee). `frozen_root`/`frozen_total_stake` unchanged.
- `CaseTerms` (frozen at filing, Ugly-6): gains `reveal_threshold_bps`, `shortfall_policy`,
  `max_draw_attempts`.
- `Round`: **add `draw_attempt: u32`** (per-round redraw counter, resets each appeal round).
- Vaults: `stake_vault` = Subaccord PDA ATA of `staking_token`; `fee_vault` = Subaccord PDA ATA of
  `fee_token`. Both `init_if_needed`. `stake_vault` touched ONLY by `stake`/`withdraw` + slash
  ledger; `fee_vault` by `create_dispute`/`appeal`/`withdraw_fees`/`cancel_dispute`/
  `claim_appeal_refund`.
- New instructions: **`withdraw_fees`** (per-juror, `fee_vault`→ATA, zeroes `fees_earned`, no
  `active_draws` gate, no timelock), **`redraw`** (permissionless crank).
- Seed: `hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt ‖ seat ‖ retry)`.
- Modules: `programs/accord/src/{lib,state,errors,events,constants}.rs`, `packages/sdk/src/*`,
  `tests/src/*`, `apps/docs/**`.

### 3. Edge Cases & Constraints

- **`stake_vault` is sacred** — dispute fee economics NEVER touch it. Slashing is ledger-only
  (`stake_delta`); the `stake_vault` balance is invariant under slash+redistribution.
- **Fund invariant MUST hold at every mutation site** — `assert_fund_invariants()`:
  `stake_vault.balance == Σ staked` (± pending `stake_delta`);
  `fee_vault.balance == Σ dispute.fee_paid + Σ fees_earned + Σ AppealBond.amount`.
- `reveal` no longer credits fees or moves tokens — vote-recording only.
- Shortfall slash goes to `stake_delta` (pending), NEVER to `staked` directly — keeps the inflation
  guard (`staked >= leaf.stake`) passing ⇒ no dead zones in the frozen root.
- `draw_attempt` is orthogonal to `round_idx`: bumping it must NOT grow the panel, consume an
  appeal, or shift AppealBond indexing.
- `withdraw_fees` has NO `active_draws` gate and NO timelock (fees are earned, not at-risk).
- `> (1−threshold)` stake can force `Failed` — accepted (safe: no wrong ruling; priced by slashes).
- Bonds are `fee_token`, custodyed in `fee_vault`.

### 4. Business Logic (pseudo-code)

```
finalize_round:
  if reveal_count >= ceil(panel * threshold_bps / 10000):
      for revealer: fees_earned += fee_per_juror; fee_paid -= fee_per_juror
      result = plurality(reveals); state = RoundResolved
  else:
      state = RedrawEligible   # no credits

redraw:  # permissionless, only if RedrawEligible and draw_attempt < max_draw_attempts
  for juror in round:
      if not revealed: stake_delta -= α*min_stake; slash_reserve -= α*min_stake
      active_draws -= 1
  round.draw_attempt += 1; clear jurors/commits/reveals; reset windows; state = Created
  # elif draw_attempt == max_draw_attempts: -> Failed (refund fee_paid + bonds; slashes stand)

withdraw_fees:
  amt = fees_earned; fees_earned = 0
  transfer fee_vault -> juror fee_token ATA (amt)
```

### 5. Definition of Done

- [ ] Two mints/two vaults wired; `fees_earned` aggregate; `withdraw_fees`; `stake_vault` never
      touched by fee economics.
- [ ] `assert_fund_invariants()` green at every mutation site (LiteSVM + e2e).
- [ ] Reveal-quorum threshold gate in `finalize_round`; `redraw` crank; `draw_attempt` seed;
      `max_draw_attempts → Failed` (refund + slashes stand).
- [ ] ADR-0020 + ADR-0021 merged; ADR-0002 banner + index updated; SPEC/AGENTS/CONTEXT/
      trust-profile/integration docs updated.
- [ ] LiteSVM unit TDD green per instruction; Surfpool e2e green-rule sign-off (both epics).
- [ ] `make lint` clean; `make test_unit` green.

### 6. Test Matrix (Given / When / Then)

- Given a funded dispute, When reveal_count ≥ threshold, Then each revealer `fees_earned` credited,
  `fee_paid` decremented, `RoundResolved`.
- Given reveal_count < threshold, When `finalize_round`, Then no credits, RedrawEligible.
- Given RedrawEligible, When `redraw`, Then no-shows `stake_delta` slashed, `draw_attempt++`, round
  cleared; `round_idx` and panel size UNCHANGED.
- Given `draw_attempt == max_draw_attempts`, When shortfall, Then `Failed`, `fee_paid`+bonds
  refunded, no-shows' `stake_delta` slashes retained.
- Given a no-show slashed across redraws + a participant runs `reconcile_stake`, When that juror is
  drawn again, Then `free_stake` gate excludes them.
- Given `withdraw_fees`, When juror has `active_draws > 0`, Then withdrawal STILL succeeds (no gate).
- Given the fee invariant, When any fee/stake op, Then `assert_fund_invariants()` holds.

### 7. Open Questions

- Exact `Round` reset semantics on `redraw` (clear arrays in-place vs. close+reinit) — pick the
  lower-CU option during implementation; the PDA seed `(dispute, round_idx)` is unchanged.
- Whether `shortfall_policy` enum needs a second v1 variant (e.g. `Fail`) or ships single `Redraw` —
  default single `Redraw`; assume and proceed.
- qedspec: none exists yet (AGENTS.md) — defer; not blocking.
