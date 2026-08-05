---
# accord-r6ti
title: Multi-round settlement — per-round crank, final-ruling coherence, immediate participation fee (CONCEPT-REVIEW Ugly 5)
status: completed
type: task
priority: critical
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T15:26:11Z
parent: accord-ukqg
blocked_by:
  - accord-4e7p
---

## Why

`finalize_dispute` (`lib.rs:1309-1345`) decrements `active_draws` and distributes
fees ONLY for the **final** round's panel. Prior rounds' jurors keep
`active_draws > 0` forever → their stake is **permanently locked**. Their round
fees sit in the vault as "surplus" (no destination). This is a hard fund-lock +
accounting bug, not a design nicety. CONCEPT-REVIEW §Ugly 5 / conceptual blocker #8.

## How (grilled + agreed model)

Decouple the two payments and judge coherence against the **final ruling**, not the
round's own result. Rationale (grilled): under round-level settlement a briber can
capture round 1, the bribed jurors get paid as "round-coherent," and an appeal that
flips the ruling refunds the appellant's bond — so the captured round is subsidized
by the protocol. Under final-ruling coherence, captured early-round jurors who voted
the overturned result are SLASHED at finality, which is exactly what makes
early-round capture expensive to overturn-survive. It also gives the whole dispute
a single Schelling focal point ("what a large honest panel concludes") rather than N
noisy per-round focal points.

Model:

1. **Participation fee** (`fee_per_juror`): paid per round **on reveal**,
   outcome-independent. Non-revealers forfeit it + are slashed (objective failure,
   no judgment needed). Immediate, so jurors aren't cash-starved during a long
   appeal ladder.
2. **Coherence slash** (α·min_stake) + forfeited appeal bonds: judged against the
   **final ruling**, distributed at finality across ALL rounds' jurors. Voted with
   final ruling → coherent share; voted against → slashed.
3. `finalize_dispute` shrinks to: read the last round's result, write
   `dispute.final_ruling`, settle ONLY the final round against it.
4. New permissionless `settle_round(round_idx)` crank settles each prior round
   against `final_ruling` (≤ 31 juror accounts per call — fits the account limit;
   you cannot settle all 3+7+15+31 ≈ 56 juror stakes in one tx). Releases
   `active_draws` for that round.
5. No-flip bonds → coherent pool; flip bonds → existing `claim_appeal_refund`.

## TDD acceptance

- Two-round dispute: a round-1 juror who voted the overturned option is SLASHED at
  finality and receives NO coherence reward.
- A round-1 juror who voted the final ruling receives a coherence share.
- Participation fee is paid on reveal regardless of final outcome.
- After all `settle_round` cranks + `finalize_dispute`, every drawn juror's
  `active_draws == 0` (no permanent lock).
- Every round fee has a named destination (no vault "surplus" leakage).
- Account-limit-feasible: each settlement call ≤ 31 juror-stake accounts.

## References

CONCEPT-REVIEW §Ugly 5; ADR-0004; `lib.rs:1187-1470`. Requires a new ADR. Blocked by
the frozen-case-terms task (settle_round reads frozen α / min_stake / fee_per_juror).

## Summary of Changes

### Program (`programs/accord/src/`)

- **`lib.rs`**:
  - `reveal` now pays `fee_per_juror` immediately via PDA-signed SPL transfer
    (vault → juror ATA). Added 4 token accounts to the `Reveal` context.
  - `finalize_dispute` rewritten: settles ONLY the final round against
    `final_ruling` (no round_fee in pool — fees paid on reveal). Pool =
    slash_total + non_revealer_fee + forfeited_bonds. Writes `final_ruling`,
    marks round settled, transitions to `Final`.
  - NEW `settle_round(round_idx)`: permissionless crank settling prior rounds
    against `final_ruling`. Pool = slash_total + non_revealer_fee (no bonds).
    Releases `active_draws` for the round. Idempotent via `settled` flag.
  - NEW `settle_round_accounts()` helper: shared per-round coherence settlement
    (verify PDAs, compute pool, apply slashes + shares, decrement active_draws).
  - NEW `SettleRound` account context.
- **`state.rs`**: `Round.settled: u8` (0/1) replaces 1 byte of `_pad1` — zero
  account-size change. `bool`→`u8` because `bool` is not `Pod`.
- **`errors.rs`**: `RoundAlreadySettled`, `RoundNotSettlable`.
- **`events.rs`**: `RoundSettled`.

### Tests

- **`settlement_litesvm.rs`** (NEW, 7 tests): multi-round flipped-appeal
  settlement, participation fee on reveal, idempotency, settle-before-final
  revert, settle-current-round revert, 3-round full-ladder active_draws=0,
  non-revealer fee pool.
- **`voting_litesvm.rs`**: updated `do_reveal` signature (+mint), economics
  assertions (pool no longer includes round_fee), `do_finalize_dispute` round
  now mutable.
- **`appeal_litesvm.rs`**: same `do_reveal` + `do_finalize_dispute` fixes,
  no-flip pool assertion updated.
- **`state.rs`**: Round struct initializer updated for `settled` field.

### Docs

- **ADR-0014**: multi-round settlement against the final ruling.

### ADR

ADR-0014 documents the model, rationale, and consequences.

### Verification

All 90 LiteSVM tests pass (`make test_unit`): 14 voting, 10 appeal, 7
settlement, + 59 across other suites.
