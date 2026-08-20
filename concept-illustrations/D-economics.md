# Group D — Economics

Illustration targets for the Accord docs site. Each concept gets one individual, self-contained looping motion illustration (~3–8s) that makes the concept click without narration.

**What Accord is:** a Schelling-point arbitration primitive on Solana. Any program (an *Arbitrable*) files a Dispute via CPI; Accord draws stake-weighted Jurors from a live Merkle-Sum-Tree accumulator using VRF randomness, collects commit-reveal votes, and emits a Ruling. Coherent Jurors earn fees plus slashed stake; incoherent Jurors are slashed. Appeals double the panel (3→7→15→31) at exponentially rising bond cost.

---

## D1. Two mints, two vaults (token topology + invariants)

`staking_token` (collateral, sortition weight, slash exposure) vs `fee_token` (compensation, fees, bonds), each with its own vault, and the accounting invariants that hold by construction. Illustrate as the Subaccord container with both vaults and every instruction's arrows color-coded by token (`stake`/`withdraw` touch only `stake_vault`; `create_dispute`/`appeal`/`withdraw_fees` touch only `fee_vault`), with the two invariant equations boxed at the bottom: `stake_vault.balance == Σ JurorStake.staked` and `fee_vault.balance == Σ fee_paid + Σ fees_earned + Σ bonds`. Auditors will screenshot this one.

## D2. Coherence settlement (slash is a ledger, not a transfer)

After `Final`: coherent jurors gain `fees_earned` (fee_token: participation fees + forfeited appeal bonds + non-revealer fees) and `staked` (staking_token: `α·min_stake` per incoherent juror); the `stake_vault` balance never moves. Illustrate as a settlement tableau with jurors sorted into coherent/incoherent columns, token arrows drawn as annotations on account ledgers rather than vault-to-wallet transfers — the vault drawn as visually untouched — and `withdraw_fees` as the only fee-token exit door.

## D3. The appeal ladder (exponential anti-bribery)

3 → 7 → 15 → 31 jurors, each step posting a bond in `fee_token`, forfeited to the final coherent pool if the appeal fails to flip the ruling, refunded if it flips. Illustrate as a widening staircase/pyramid with log-scale price tags on each step and a bribery cost curve shooting past the value of capturing the ruling; caption the two exhaustion facts — appeal budget exhausted → the ruling stands; bond flipped → appellant refunded.

## D4. Final-ruling retroactive coherence (multi-round settlement)

Coherence is judged against `dispute.final_ruling`, not each round's own result — a bribed round-1 majority that gets overturned is slashed at finality, which is what makes early-round capture expensive. Illustrate as a horizontal round timeline with a beam from the final ruling sweeping back over all prior rounds, re-coloring each vote coherent/incoherent against the final outcome; show the per-round `settle_round` cranks walking left-to-right releasing each round's `active_draws`.

## D5. The juror's capital journey (`active_draws` lock, two-phase withdraw)

Stake in → leaf appended → drawn (lock counter up, capital frozen) → rounds settle (lock releases) → `request_withdraw` (leaf weight zeroed, funds banked to `pending_withdrawal`) → `withdraw` (SPL out). Illustrate as a journey/airlock strip for one juror's tokens, with the lock rendered as a padlock whose shackle only opens when every drawn dispute reaches a terminal state. This is where "why can't I unstake right now" gets answered in one picture.
