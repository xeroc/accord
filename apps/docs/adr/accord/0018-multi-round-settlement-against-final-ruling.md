# ADR-0018: Multi-round settlement against the final ruling

## Status

Accepted

## Context

CONCEPT-REVIEW §Ugly 5 identified a hard fund-lock + accounting bug in the
original `finalize_dispute` (bean accord-r6ti):

1. **Permanent stake lock.** `finalize_dispute` only decremented `active_draws`
   for the **final** round's panel. Prior rounds' jurors kept
   `active_draws > 0` forever — their staked capital was permanently locked
   (could never `unstake`).

2. **Vault surplus leakage.** Prior rounds' juror fees sat in the vault with no
   named destination — no instruction ever redistributed them.

3. **Round-level coherence subsidized capture.** Under round-level settlement
   (judge each round against its own result), a briber could capture round 1,
   the bribed jurors get paid as "round-coherent," and an appeal that flips the
   ruling refunds the appellant's bond — the captured round is subsidized by
   the protocol.

## Decision

Decouple participation payment from coherence judgment, and judge coherence
against the **final ruling** — not the round's own result.

### 1. Participation fee — paid on reveal, outcome-independent

`fee_per_juror` is paid **immediately** on `reveal` via PDA-signed SPL transfer
from the vault to the juror's ATA. This is outcome-independent: every revealer
gets paid on the spot, so jurors are never cash-starved during a long appeal
ladder. Non-revealers forfeit their fee (it stays in the vault and folds into
the coherent pool at settlement).

### 2. Coherence — judged against the final ruling

At settlement, each juror's coherence is `revealed_vote == dispute.final_ruling`
— NOT the round's own plurality result. A round-0 juror who voted the option
the final panel overturned is slashed; one who voted the final ruling gets a
coherence share. This gives the whole dispute a single Schelling focal point
("what a large honest panel concludes") rather than N noisy per-round focal
points. It also makes early-round capture expensive: a captured early-round
juror who voted the overturned result is slashed at finality.

### 3. Per-round settlement crank

`finalize_dispute` shrinks to: write `final_ruling`, settle ONLY the final
round (coherence + forfeited appeal bonds → final-round coherent pool), mark
the round settled, transition to `Final`.

A new permissionless `settle_round(round_idx)` crank settles each prior round
against `final_ruling`. Each call handles one round's ≤ 31 juror-stake accounts
(fitting the transaction account limit — you cannot settle all 3+7+15+31 ≈ 56
juror stakes in one tx). Releases `active_draws` for that round.

### 4. Pool composition

For each round's settlement:

- **Pool** = `slash_total` (incoherent jurors × `α·min_stake`) +
  `non_revealer_fee` (`(panel − reveal_count) · fee_per_juror`) +
  `pool_extra` (forfeited no-flip appeal bonds — final round only).
- **Share** = `pool / coherent_count` (integer div; remainder stays in vault
  as protocol surplus — accepted edge case when `coherent_count == 0`).
- Participation fees for revealers were already paid on `reveal` — they are NOT
  in the pool.

### 5. Idempotency

A `settled: u8` flag on `Round` (0 = pending, 1 = settled) prevents
double-settlement. `finalize_dispute` checks `round.settled == 0` before
settling the final round; `settle_round` checks it for prior rounds. The flag
reuses existing padding in the zero-copy `Round` struct — no account-size
change.

## Consequences

- **No permanent lock.** After `finalize_dispute` + all `settle_round` cranks,
  every drawn juror has `active_draws == 0`.
- **Every fee has a destination.** Revealers get paid on reveal; non-revealer
  fees + slashes + forfeited bonds → coherent pool.
- **`reveal` instruction gains 4 accounts** (staking_token, juror_token_account,
  vault, token_program) for the fee transfer. This is an IDL/SDK breaking
  change.
- **Coherence is final-ruling-relative**, not round-relative. A juror who voted
  "correctly" for their round but against the final ruling is slashed. This is
  by design: it makes early-round capture expensive to overturn-survive.
- **No-flip bonds** still fold into the final round's coherent pool (via
  `pool_extra` in `finalize_dispute`). **Flip bonds** still return via
  `claim_appeal_refund` (unchanged).

## References

- CONCEPT-REVIEW §Ugly 5
- ADR-0004 (party-agnostic permissionless appeal)
- Bean accord-r6ti
