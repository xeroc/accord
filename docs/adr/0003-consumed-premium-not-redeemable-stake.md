# Consumed premium model (not redeemable stake)

Premiums paid by the Insured are consumed — they buy a period of coverage and do not build redeemable capital. The Insured cannot withdraw their Premiums. This is traditional mutual semantics, not a savings/stake model.

## Considered Options

- **Redeemable at-risk stake** (pure mutual — payments build a stake that IS the pool's capital, redeemable minus dilution): self-funding from day one, no empty-pool problem. But the incentive is weak without yield ("why pay in if I can't earn and at best get my deposit back minus dilution?"), and it's closer to a savings vehicle than a mutual.
- **Consumed premium + yield on float** (deploy the pool's capital to DeFi for yield): partially solves the incentive problem. Deferred to v2 — the basics of pay → covered → claim → payout must work first.

## Consequences

- The Premium Fund starts empty each period. A cold-start problem exists: the Reserve Fund (Staker capital + retained surplus) must back the pool from day one. Stakers ARE the bootstrap.
- The Insured's relationship is "participant paying for coverage," not "capital provider." Cleaner mental model, traditional mutual UX.
- Year-end Surplus can partially refund the Insured (mutual dividend), creating a loyalty incentive without requiring yield-bearing capital.
- Adding yield-on-float later (v2) is an enhancement, not an architectural change — the Premium Fund's balance can be deployed to yield sources without changing the consumed-premium semantics.
