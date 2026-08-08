# Two-mint/two-vault economics — `stake_token` (collateral) + `fee_token` (compensation)

> Partially supersedes [ADR-0002](0002-per-subaccord-staking-token-no-accord-token-v1.md): the
> "single `staking_token` used for both stake and fees" decision is replaced by a two-mint split.
> 0002's other decisions — per-Subaccord token choice, no Accord token in v1, stake-asset-agnostic
> Schelling — stand.

A Subaccord now configures **two** mints: `stake_token` (collateral — sortition weight + slash
exposure) and `fee_token` (compensation — participation fees + appeal bonds, USDC by convention).
Each mint has its own vault on the Subaccord PDA: `stake_vault` (juror capital, never touched by
dispute fee economics) and `fee_vault` (filer fees + bonds + reward pool, shared across the
Subaccord's disputes). Juror earned fees accumulate on the `JurorStake` PDA as a withdrawable
`fees_earned` ledger, not as per-reveal SPL transfers.

Four decisions, resolved in the 2026-08-07 grilling:

1. **Two mints.** Collateral and compensation are different economic roles. Conflating them
   (0002's single `staking_token`) commingled juror capital with dispute fees in one token
   account and forced `cancel_dispute` to reconstruct "how much of the pile is the filer's" by
   vault-balance arithmetic (CONCEPT-REVIEW §4.14 insolvency hazard), and made every fee movement
   distort stake weight.
2. **`fees_earned` aggregate ledger.** Fees are credited to `JurorStake.fees_earned` (not paid to
   ATAs on reveal) and withdrawn in one per-juror `withdraw_fees`. This removes the USDC-ATA
   account blowup from the settlement hot path — settlement writes `fees_earned` to the
   `juror_stake` accounts it already iterates — and aggregates a juror's earnings across all
   disputes into a single withdrawal.
3. **Per-Subaccord `fee_vault` (not per-dispute).** Every fee movement is a balanced ledger entry,
   so the invariant `fee_vault.balance == Σ dispute.fee_paid + Σ JurorStake.fees_earned +
   Σ AppealBond.amount` holds by construction. A juror only ever withdraws what was credited to
   them, from a specific dispute's pool; no dispute can overdraw. This eliminates per-dispute ATAs
   while keeping each dispute's fee accounting isolated in the ledger.
4. **Slash proceeds redistribute as stake (Option A).** Slashing is pure ledger: subtract from the
   incoherent juror's `staked`, add to the coherent juror's `staked`, recompute the root. No SPL
   transfer; the `stake_vault` balance is invariant under slashing + redistribution. The
   "rich-get-richer" stake drift this causes was judged less harmful than the weaker coherence
   carrot of burning slash proceeds.

Participation-fee **conditionality** (paid only when the round reaches its reveal threshold, at
`finalize_round`, not on `reveal`) is locked in [ADR-0021](0021-reveal-quorum-shortfall-redraw-draw-attempt.md);
it is what makes failed rounds pay nothing and the filer's single deposit suffice across the
redraw ladder.

## Considered Options

**Token model.**

- **Single `staking_token` for stake + fees (0002, status quo).** Rejected — commingles capital
  with fees in one account (§4.14) and every fee inflates stake weight (rich-get-richer via the
  fee vector).
- **Two mints — `stake_token` + `fee_token` (chosen).** Decouples security asset from compensation
  asset; clean willingness-to-pay signal (USDC fees, §3.6); stops fee-driven stake drift; unblocks
  a governance/collateral token without making it the fee unit.
- **Three mints (stake / fee / bond separate).** Rejected — bonds are economically fee-category
  (refundable deposits priced in stable units); a third vault adds accounts for no behavioral gain.

**Fee payout shape.**

- **Direct vault→ATA on reveal (status quo, single-token).** Rejected under two-mint — paying N
  coherent USDC rewards at settlement needs N USDC ATAs in the settle pass, blowing the 1232-byte
  packet (settle already passes ≤ 31 `juror_stake` + bonds).
- **`fees_earned` aggregate ledger + per-juror `withdraw_fees` (chosen).** Settlement writes
  `fees_earned` to accounts it already iterates; the only fee-token SPL transfers are
  `withdraw_fees` (per juror), `create_dispute`/`appeal` (in), `cancel_dispute`/
  `claim_appeal_refund` (refund out).

**Fee vault scope.**

- **Per-dispute `fee_vault`.** Cleaner refund isolation, but an ATA per dispute (filer rent) and
  no marginal benefit once fees are a balanced ledger.
- **Per-Subaccord `fee_vault` (chosen).** One shared ATA; per-dispute isolation lives in the
  ledger invariant, not in separate accounts.

**Slash-proceeds destination.**

- **Burn/sink (Option B).** Kills rich-get-richer fully and removes the reward-half root
  recompute. Rejected this session — the weaker coherence carrot was judged not worth losing the
  slash-redistribution incentive.
- **Redistribute to coherent jurors as stake (Option A, chosen).** Keeps the carrot; the drift was
  judged acceptable. The slash-driven root recompute stays (it is load-bearing sortition
  integrity); only the fee-driven half is removed.

## Consequences

- `Subaccord` gains `fee_token: Pubkey` alongside `staking_token`. `staking_token` is the
  collateral mint (sortition + slashing); `fee_token` is the compensation mint (fees + bonds).
  Both chosen at `create_subaccord`.
- `JurorStake`: rename `amount → staked`, `settlement_delta → stake_delta`; add
  `fees_earned: u64` (fee_token credit, withdrawable, no `active_draws` gate, no timelock). +8
  bytes → the `layout` offset consts and `layout_tests::offsets_match_borsh` must be updated.
- Two vaults on the Subaccord PDA: `stake_vault` (ATA of `staking_token`) and `fee_vault` (ATA of
  `fee_token`), both `init_if_needed`. `stake_vault` is touched only by `stake`/`withdraw` and the
  slash ledger (never by dispute fee economics); `fee_vault` by `create_dispute`/`appeal`/
  `withdraw_fees`/`cancel_dispute`/`claim_appeal_refund`.
- `reveal` becomes vote-recording only (no fee credit, no ATA, no SPL transfer). The participation
  fee is credited at `finalize_round`, gated on the reveal threshold (ADR-0021).
- `dispute.fee_paid` changes meaning from "total deposited" to **"running available fee pool"**
  (decremented as jurors earn, incremented on an appeal's fee portion). The bond portion stays
  tracked in `AppealBond`.
- New instruction `withdraw_fees`: per-juror, pulls the aggregate `fees_earned` from `fee_vault`
  → juror `fee_token` ATA, zeroes `fees_earned`. No `active_draws` gate, no timelock (fees are
  earned, not at-risk capital).
- Appeal bonds are denominated in `fee_token` and custodyed in `fee_vault`; forfeited bonds fold
  into the fee reward pool.
- **Fund invariant, enforced by `assert_fund_invariants()`** at every fee/stake mutation site in
  the test harness (and a debug read path):
  `stake_vault.balance == Σ JurorStake.staked` (± pending `stake_delta`);
  `fee_vault.balance == Σ dispute.fee_paid + Σ JurorStake.fees_earned + Σ AppealBond.amount`.
- The Schelling point is stake-asset-agnostic (0002 stands); the split changes only the
  denomination of each economic role, not the coherence incentive. No Accord token is introduced
  in v1 (0002 stands).
- Complements ADR-0018 (multi-round settlement — now writes both `stake_delta` and `fees_earned`),
  ADR-0019 (kit config — `fee_token` joins the Subaccord surface), ADR-0012 (accumulator — the
  `stake_delta` fold path is unchanged). Supersedes the single-token decision of 0002.

## Implementation

Tracked in the two-mint/two-vault milestone bean (Epic: program). Tasks: `state.rs` + layout
offsets; `create_subaccord` `fee_token` param + dual-vault init; `stake`/`withdraw` → `stake_vault`;
`create_dispute`/`appeal` → `fee_vault`; `reveal` fee-credit removal; `finalize_round`
threshold-gated credit; new `withdraw_fees`; `assert_fund_invariants`; SDK (types/config/
instructions/PDAs); LiteSVM TDD; Surfpool e2e; this ADR + SPEC/AGENTS/CONTEXT/trust-profile.
