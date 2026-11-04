---
# accord-maz4
title: Unreconciled losses create unbacked juror rewards — settle cap and draw gate must read stake net of pending stake_delta
status: completed
type: bug
priority: normal
created_at: 2026-11-04T08:24:36Z
updated_at: 2026-11-04T08:44:55Z
---

Security review finding (SR4-M-2, 2026-11-04): settle_round_accounts caps each slash at min(slash_per_juror, js.staked) and draw_seat gates on staked - slash_reserve — both read the canonical ledger blind to pending stake_delta losses. Settlement releases slash_reserve without touching staked (accumulator commits to it), so a juror with recorded 200, pending -100, and no reservation passes the draw gate at full weight and is slashed again at min(slash, 200). After N un-reconciled losses reconcile floors the loser at 0 and DISCARDS excess debt while winners keep full credits: 3 rounds of a no-show juror at min_stake=100, alpha=10000 yields claims 700 against 600 deposited. Fix: one effective_stake(js) = clamp(staked + stake_delta, 0, u64::MAX) helper used by BOTH the settle cap (credit+debit passes) and the draw free-stake gate; rewrite the two stale in-code comments claiming the cap is a no-op. Tests: LiteSVM custody-conservation across sequential disputes (RED pre-fix), reconcile-order permutations, net-below-min juror un-drawable, capped slash at effective.

## Summary of Changes

- `programs/accord/src/utils.rs` — new `effective_stake(js) = (staked + stake_delta) clamped to [0, u64::MAX]`; BOTH settle passes (`slash_total` credit pool + per-juror debit) cap at `min(slash_per_juror, effective_stake)` instead of bare `staked`; both stale "cap stays a no-op" comments rewritten with the correct cross-round invariant.
- `programs/accord/src/instructions/draw_seat.rs` — free-stake gate reads `effective_stake(js) − slash_reserve ≥ min_stake`; comment documents why the reservation argument now holds across rounds.
- LiteSVM RED→GREEN (depleted juror's draw genuinely succeeded pre-fix): `draw_gate_reads_pending_losses` + `sequential_slashes_conserve_custody` — the latter asserts the custody invariant `Σ (staked + pending_withdrawal) == Σ deposited` across 3 sequential silent-loser settlements + root-aware sequential reconciles (ejection banks the sub-min remainder onto the withdrawal rail, zero debt discarded).
- Test-harness note: an ineligible-but-weighted leaf CANNOT be legally skipped in the retry loop (tzo0: every prior retry must be a genuine collision) — the test brute-forces a VRF selecting the excluded juror at seat 0. The panel then stalls → pre-draw cancel timeout (SR3-H-1 escape family).
- Docs: SPEC draw_seat row (effective-stake eligibility) + security-checklist SR4-M-2; changeset `.changeset/loud-geese-conserve.md` (sdk only — no TS source changed).
- Verification: `cargo test --features no-entrypoint` green twice (all binaries, 89/89 accumulator incl. the 2 new); stress-ran the pair 8×, zero flakes; `make build` fresh ELFs; no TS consumer replicates the eligibility math (chain is the authority).
