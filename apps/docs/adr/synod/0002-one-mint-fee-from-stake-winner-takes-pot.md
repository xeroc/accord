# One mint, fee-from-stake, winner takes the pot

Synod's party economics run in a **single mint** — the target Subaccord's
`fee_token` (ADR-0020) — with the simplest possible flow:

- Every party deposits the **same stake `S`** at join. No per-party amounts,
  no tiers, no asymmetric multipliers in v1.
- At file, the juror fee (`initial_num_jurors · fee_per_juror`, **frozen at
  `open_case`** so governance cannot shift the deal mid-window) is deducted
  from the collective escrow and paid to Accord in the `create_dispute` CPI.
  **The fee is gone** — jurors are paid at reveal (ADR-0018); there is no
  winner reimbursement and no cost-follows-the-loser netting.
- **Pot `= N·S − fee` → the prevailing party.** Neutral ruling → each party
  refunded `S − fee/N` (jurors earned). Accord `Failed`/cancel → each party
  refunded `S` in full (the un-consumed fee returns to the case PDA).
- All payouts are **pull-based and idempotent** (per-party payout bits); no
  push transfers, ever.

## Considered Options

**Mints.**

- A separate party-stake mint (Kleros's PNK-shaped model). Rejected — a second
  mint doubles vault plumbing for zero v1 value; party stake is pot money, not
  juror collateral (juror slashing runs on `JurorStake`/`staking_token` and
  never touches Synod).
- **The Subaccord's `fee_token` for everything (chosen).** One vault, one
  code path; stake and fee are the same asset so "fee from stake" is a single
  deduction.

**Fee funding.**

- Opener fronts the whole fee; or pro-rata shares collected separately.
  Rejected — either way there are two monies per party (stake + fee share) and
  a reimbursement question at settlement.
- **Fee deducted from the stake at file (chosen).** One deposit per party; the
  escrow is over-collateralized by exactly the fee until filing.

**Winner reimbursement (Kleros's cost-follows-the-loser).**

- Winner made whole from loser stakes at claim. Rejected for v1 — it is
  real netting code (fees are already consumed; "reimbursement" is a transfer
  out of the losers' pot) for a benefit the pot already prices. A party who
  expects to win simply sets their expected recovery against `S`.
- **No reimbursement (chosen).** The fee is a shared cost of convening the
  jury, sunk at filing.

**Payout shape.**

- Share the pot with coherent jurors, or pro-rata among parties. Rejected —
  jurors already earn fees + forfeited appeal bonds; pro-rata mutes the
  skin-in-the-game that makes frivolous joining expensive.
- **Winner takes the pot (chosen).** Binary, legible, maximal deterrence.

## Consequences

- **`S` is the only economic dial** — it prices skin-in-the-game AND absorbs
  the fee. A careless opener sets `S ≈ fee` and the winner nets ~nothing;
  Synod validates `N·S > fee` at open and the rest is the opener's
  calibration problem (documented in SPEC §Economics).
- Rounding: neutral refunds floor at `S − fee/N`; the dust remainder rides the
  last claim. No third payout mode.
- Escrow-liveness: the vault balance is always ≥ outstanding per-party claims
  (SPEC §Invariants) — there is no configuration in which refunds are
  under-collateralized, because the only outflow before settlement is the
  frozen fee.

## Authority

`programs/synod/SPEC.md` §Economics · `meta/specs/PROG-MULTI-PARTY.md` (Q-e/f/g
resolutions, 2026-08-18) · Accord ADR-0018 / 0020 · `CONTEXT.md`.
