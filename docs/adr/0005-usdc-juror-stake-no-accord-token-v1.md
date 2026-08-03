# USDC juror stake — no accord token in v1

Jurors stake USDC (not an accord-specific token) to participate in Subaccords. Selection probability ∝ USDC staked. Coherence slashing = lose USDC. No new token is introduced.

## Considered Options

- **Accord-specific token** (PNK equivalent — fixed supply, appreciates with accord usage, "corrupt the accord → token crashes → attackers destroy their own wealth"): strongest game theory and attack resistance. But introduces a token (distribution, liquidity, regulatory questions), which contradicts the project's "no token" stance, and the price mechanism isn't load-bearing at v1 scale.
- **Accord token from day one**: rejected for the same reasons — scope creep before the mechanism is proven.

## Consequences

- The Schelling Point works identically with USDC — coherence incentive (vote with majority or lose stake) is stake-asset-agnostic.
- No price mechanism: a wealthy attacker can stake dominant USDC without worrying about "destroying token value." Mitigated by: exponential appeals (bribery becomes prohibitively expensive), coherence slashing (dishonest Jurors lose stake if the broader pool disagrees), and minimum-stake requirements.
- Migrating from USDC-stake to an accord-token-stake (v2) is a mechanism change, not just a parameter change. Acceptable as a v2 migration when attack resistance becomes load-bearing and real dispute data justifies the token.
- Per-Subaccord staking tokens (each Subaccord defines its `stake_token`) provide flexibility: a Subaccord could later use an accord token, SOL, or any SPL token without changing the program.
