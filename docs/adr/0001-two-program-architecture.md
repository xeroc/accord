# Two-program architecture: Court and Mutual as separate programs

The Court (arbitration) and Mutual (mutual factory) are separate Anchor programs. The Mutual program is a client of the Court via the Arbitrable CPI interface (`create_dispute` / `get_ruling`). The Court has zero knowledge of mutuals.

## Considered Options

- **One program** (Court + Mutual combined): simpler integration, no CPI, but couples adjudication to the mutual business, prevents the Court from being a standalone reusable product, and makes the program enormous.
- **Two programs, Mutual first**: the opposite build order. Rejected because the Court is the technically harder, more novel piece (Schelling mechanism, VRF, commit-reveal), and proving it standalone de-risks the Mutual layer.

## Consequences

- The Court is a standalone product with its own PMF (any program needing dispute resolution can use it).
- The Mutual program's adjudication is two CPI calls — thin and replaceable.
- Program boundaries are hard to reverse (different program IDs, different upgrade authorities).
- A bug in one program doesn't affect the other's funds (PDA-isolated).
