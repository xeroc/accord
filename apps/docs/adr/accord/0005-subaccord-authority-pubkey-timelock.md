# Subaccord parameter authority — single Pubkey with on-chain timelock

A Subaccord's mutable parameters (fees, windows, α, min_stake) are governed by a single `authority: Pubkey` set at creation, where `Pubkey::default()` means immutable. Non-default authorities mutate params via a propose/execute pair behind a 48h on-chain timelock. Kleros governs subcourts via its PNK token; Accord has no token in v1 (ADR-0002), so governance falls to a designated key (typically the Subaccord creator's multisig) rather than token holders.

## Considered Options

- **Immutable params:** simplest and most predictable, but a Subaccord with mis-set params simply dies — no tuning as it matures.
- **Stake-weighted Juror self-governance:** the Subaccord's Jurors vote (∝ stake) on changes. Most decentralized (capital providers self-govern), but drags in on-chain proposal/vote/quorum machinery. Parked for v2.

## Consequences

- The on-chain timelock is the staker-protection primitive: a Juror who dislikes a pending change can unstake (if not actively drawn) before it lands, so the authority cannot retroactively raise slash risk on locked capital.
- `domain_ref` and `evidence_spec` are immutable at creation regardless of authority.
- v2 may replace the authority with stake-weighted self-governance without changing the rest of the model.
- `UpdatePayload::AppealWindow` (ADR-0022) joins the timelocked-update set.
