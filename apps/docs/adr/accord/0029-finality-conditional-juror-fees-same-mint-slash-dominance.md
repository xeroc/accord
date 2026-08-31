# ADR-0029: Juror fees settle at finality against the final ruling; same-mint slash-dominance guard

## Status

Accepted (implementation pending — bean `accord-3j58`)

## Context

The 2026-08-31 appeal-economics audit (Kleros v1/v2 contracts, Aragon Court
whitepaper, UMA docs) established two facts about Accord's fee model:

1. **Accord is the only studied court that pays a round's jurors before the
   final ruling exists.** `finalize_round` credits every revealer
   `fees_earned += fee_per_juror` at round resolution — outcome-independent,
   never clawed back (ADR-0018 §1, as amended by ADR-0020). Kleros v1/v2 and
   Aragon settle **every** round only after the final ruling, and pay fees
   only to jurors coherent **with that final ruling**; an incoherent juror's
   would-be fee is itself redistributed to the coherent pool (Kleros
   whitepaper: jurors "will not receive their arbitration fees … given to
   coherent jurors").

2. **The unconditional fee is the only guaranteed payout for an incoherent
   vote, so it forces a numeric invariant the program cannot soundly check.**
   With probability `P` of an indifferent/coin-flip vote landing on the final
   ruling:

   ```
   EV(indifferent reveal) = fee + P·E[share] − (1−P)·slash     (today)
   ```

   At binary `P = ½`, ignoring shares, negative EV needs
   `α·min_stake ≥ 2·fee_per_juror`. That condition is **cross-mint**
   (ADR-0020: `min_stake` is `stake_token` units, `fee_per_juror` is
   `fee_token` units) — a raw on-chain `≥` compares different assets with
   different decimals and drifting relative value. A hard cross-mint gate was
   implemented on 2026-08-31 and reverted the same day: it would reject
   economically sane pools and pass insane ones (e.g. any 9-decimal stake
   token vs 6-decimal fee token shifts the comparison 1000×), and
   filing-frozen `CaseTerms` make mid-dispute drift unfixable.

Kleros lives with the identical two-asset reality (PNK stake vs ETH fees) by
**governing the ratio per court** — it never hard-pins it. The robust part of
every precedent is not the ratio; it is that **no fee is ever paid on a vote
that ends up incoherent**.

## Decision

### 1. Fee conditionality moves from round resolution to final coherence (supersedes ADR-0018 §1)

`finalize_round` no longer credits `fees_earned`. A round's entire fee pot
(round 0: the filer's `min_jury_size · fee_per_juror`; round r>0: the appeal
fee portion of `AppealBond.amount`) settles at `settle_round` /
`finalize_dispute`, judged against `dispute.final_ruling`:

- **Coherent jurors of the round** split the whole pot — per-juror take
  `panel · fee_per_juror / coherent_count` (integer div, remainder surplus) —
  which equals the base fee when everyone is coherent, and hands the whole
  pot (base fees + forfeited incoherent fees + forfeited no-flip bonds +
  non-revealer fees) to a vindicated minority ("lone voice of reason").
- **Incoherent revealers forfeit their base fee** into the same pot.
- The existing no-coherent → revealers fallback (bean accord-aqmw) now
  carries the whole pot; zero reveals still trap (accord-31xw).
- Quorum/tally semantics are untouched (ADR-0021 gates the result, not pay).
- `claim_appeal_refund` is already forward-compatible: it refunds
  `amount − fee` and re-derives the fee on-chain — under finality-settled
  fees that fee has a real destination (the round's coherent jurors) instead
  of being pre-consumed.

Effect on the invariant:

```
EV(indifferent reveal) = P·(fee + E[share]) − (1−P)·slash      (after)
```

At binary `P = ½` the requirement halves from `slash ≥ 2·fee` to
`slash ≥ fee`, and **every fee token is now coherence-aligned** — there is no
longer any payment path that rewards a vote regardless of its outcome. This
is NOT a full structural guarantee (a fee 10,000× the slash is still a
profitable lottery for a lucky noise voter) — the residual cross-mint ratio
remains, which is why decision 2 exists and why operator discipline stays
load-bearing for split-mint pools.

The ADR-0018 "cash starvation" rationale for the upfront credit is void under
ADR-0020's ledger model: pay was never SPL-at-reveal anymore — it is a
`fees_earned` credit withdrawn later via `withdraw_fees`. Deferring the
credit defers bookkeeping, not cash flow; the wait is bounded by the appeal
window + at most `max_appeals` rounds. Honest-but-overturned jurors now lose
the fee as well as the slash — accepted deliberately (Kleros whitepaper §4.6:
"some times, honest jurors will lose coins"), compensated by the
vindicated-dissenter payoff and by ADR-0023 per-round evidence never being
punishable beyond one round's stake.

**Failed-dispute path** (redraw exhaustion / cancel — no final ruling
exists): each *resolved* round's revealers are credited their base
`fee_per_juror` (participation only; no coherence judgment is possible), the
filer is refunded the remainder of `dispute.fee_paid`, and bonds stay
claimable via `claim_appeal_refund` — preserving today's Failed-path
economics exactly while the filer refund becomes trivially exact (`fee_paid`
is never decremented before settlement).

### 2. Same-mint slash-dominance guard (numeric pin where it is meaningful)

Where `staking_token == fee_token` (the common single-collateral pool), the
numeric comparison is unit-true and IS enforced:

```text
alpha_bps · min_stake / 10_000  ≥  MIN_SLASH_FEE_RATIO · fee_per_juror
MIN_SLASH_FEE_RATIO = 2
```

- Enforced at `create_subaccord` and at both update gates
  (`validate_update_cross_field` — `AlphaBps` / `MinStake` / `FeePerJuror`
  payloads compose with the live pool), failing with `FeeDominatesSlash`.
- Ratio 2 = the pre-0029 binary bound, kept (rather than the post-0029
  theoretical 1) as margin, because coherent-pool shares are endogenous
  (forfeited bonds) and widen the lucky-noise edge.
- `fee_per_juror == 0` bypasses the gate (feeless pools stay unconstrained;
  `alpha_bps = 0` remains legal only for them).
- **Split-mint pools are explicitly not numerically checked** — the
  2026-08-31 reverted attempt is the recorded proof of unsoundness. The
  invariant there is an operator/governance responsibility (parameter
  guidance in SPEC + docs; the ratio is retunable through the 48h timelock),
  exactly as Kleros governs PNK-stake vs ETH-fee per court.

## Considered Options

- **Hard cross-mint numeric gate.** Implemented and reverted 2026-08-31 —
  compares incommensurable units; rejects sane pools, passes insane ones.
- **Keep the unconditional credit + same-mint gate only.** Leaves a guaranteed
  payout for incoherent votes at any ratio in split-mint pools and keeps
  Accord the outlier against unanimous precedent. Rejected.
- **Authority-declared `fee↔stake` rate parameter.** Relocates the problem
  into a governance knob with stale-rate failure modes. Rejected.
- **Kleros-strict with no participation floor on the Failed path.** Would let
  a redraw-exhausted dispute consume juror labor for free. Rejected — the
  Failed path pays participation.

## Consequences

- `finalize_round` loses its fee-credit block (and the round-0 `fee_paid`
  decrement) → its `remaining_accounts` juror-stake list shrinks → IDL change
  → `make codegen`, SDK facades, cranker, CLI, and e2e specs all move with it
  (change coupling per AGENTS.md).
- The vault-ledger invariant
  (`fee_vault.balance == Σ fee_paid + Σ fees_earned + Σ AppealBond.amount`)
  still holds by construction: un-settled round pots remain inside
  `dispute.fee_paid` (round 0) and `AppealBond.amount` (appeal rounds) until
  settlement consumes them. `settle_round` gains the fee-pot distribution;
  its `pool_extra` mechanism for final-round forfeited bonds is unchanged.
- Filing-fee amount is unchanged (`min_jury_size · fee_per_juror`) — no
  Arbitrable (Canon/Synod) change required; only their e2e fee assertions
  move.
- `.qedspec` settlement handlers gain the fee-pot distribution and a
  fee-conservation invariant; `formal_verification/` regenerated.
- ADR-0018 §1 (participation paid on reveal/round-resolution,
  outcome-independent) is superseded; ADR-0018 §2 (final-ruling coherence)
  is unchanged and now covers fees too. ADR-0020's "conditionality … at
  `finalize_round`" line is amended by this ADR. ADR-0021 is unaffected (it
  gates the tally, not the pay).
- **Follow-on (out of scope here):** with fees settling at finality, the
  intact fee pool enables an appellant flip-bounty at finalization (the
  "lone successful appellant" gap, ADR-0030 candidate) — designed separately.

## References

- Appeal-economics audit 2026-08-31 (KlerosLiquid `execute()`, KlerosCore
  `_executePenalties`, DisputeKitClassic `withdrawFeesAndRewards`, Aragon
  "Final Ruling", UMA DVM slashing docs; Kleros whitepaper §4.6, §4.4).
- ADR-0018 (participation/coherence decoupling — §1 superseded), ADR-0020
  (two-mint economics), ADR-0021 (reveal quorum), ADR-0023 (per-round
  evidence), ADR-0003 (flat slash).
- Reverted cross-mint pin attempt 2026-08-31 (same-day revert; repo history).
