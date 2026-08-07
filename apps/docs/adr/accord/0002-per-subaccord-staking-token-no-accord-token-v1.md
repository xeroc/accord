> **Status: Partially superseded by [ADR-0020](0020-two-mint-two-vault-stake-token-fee-token.md)** —
> the "single `staking_token` for both stake and fees" decision is replaced by a two-mint split
> (`stake_token` collateral + `fee_token` compensation). This ADR's other decisions (per-Subaccord
> token choice, no Accord token in v1, stake-asset-agnostic Schelling) stand.

# Per-Subaccord staking token — no accord token in v1

Each Subaccord specifies the SPL token its Jurors stake at creation (`staking_token`). Selection probability ∝ amount staked in that token; coherence slashing loses the same token. USDC is the common default, not a hard-coded requirement — a Subaccord may stake USDC, SOL, or any SPL token. No accord-specific token is introduced in v1.

## Considered Options

- **Hard-coded USDC (all Subaccords):** simplest, but needlessly couples every Subaccord to one asset and blocks Subaccords that want a different stake (e.g. a SOL-denominated pool). Rejected — the coherence incentive is stake-asset-agnostic, so per-Subaccord choice is free.
- **Accord-specific token (PNK equivalent — fixed supply, appreciates with usage, "corrupt the accord → token crashes → attackers destroy their own wealth"):** strongest game theory and attack resistance. But introduces a token (distribution, liquidity, regulatory questions), contradicts the "no token" stance, and the price mechanism isn't load-bearing at v1 scale.

## Consequences

- The Schelling Point works identically regardless of stake asset — coherence (vote with majority or lose stake) is stake-asset-agnostic.
- No price mechanism: a wealthy attacker can stake a dominant position without worrying about "destroying token value." Mitigated by exponential appeals (bribery becomes prohibitively expensive), coherence slashing, and minimum-stake requirements.
- Per-Subaccord tokens already provide the flexibility to adopt an accord token later (a Subaccord could set `staking_token` to the accord token) without changing the program.
- Migrating to an accord-token-stake (v2) is a mechanism change, not a parameter change — acceptable as a v2 migration when attack resistance becomes load-bearing and real dispute data justifies it.
