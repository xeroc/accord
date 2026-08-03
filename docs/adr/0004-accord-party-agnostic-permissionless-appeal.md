# Accord is party-agnostic; appeal is permissionless

The Accord has no concept of disputing "parties." `create_dispute` accepts one filer (the Arbitrable program), a question, `options`, and a `fee`; `get_ruling` returns the winning option. Anyone may appeal by posting the larger round's fee plus an appeal bond. This keeps the Accord a standalone, reusable primitive whose only integration surface is the Arbitrable CPI, and honors the locked design that the Accord has zero knowledge of the filing program's domain.

## Considered Options

- **Two-party model (Kleros §4.4):** each party deposits the fee; default judgment if one no-shows; forfeited bond to the winning party. Preserves Kleros's party economics but couples the Accord to a party concept and contradicts the party-blind Arbitrable interface.

## Consequences

- Kleros's default-judgment and bond-to-winner mechanics move off-Accord — they become the Arbitrable's responsibility. The Accord adjudicates the question; the Arbitrable manages the consequences.
- A forfeited appeal bond (the appeal fails to flip the prior Ruling) goes to the Coherent Jurors of the final round, since the Accord knows no "winning party."
- Griefing-by-appeal is bounded: max 3 appeals + exponential cost + bond forfeiture.
