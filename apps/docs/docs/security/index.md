# Security

Why the mechanism is trustworthy without reading the source — and where it still
trusts something. Start with the **Trust Profile** for the honest distribution of
power and the residual assumptions.

- [Trust Profile](trust-profile.md) — who holds power, what's trusted, the
  security-value ceiling, and the claim qualifications
- [Stake Accumulator](fraud-proofs.md) — why the juror-set root is canonical by construction (no posted root, bond, or fraud window)
- [Sortition & VRF](sortition-vrf.md) — committed VRF + Merkle-Sum accumulator + inflation guard
- [Circuit Breaker](circuit-breaker.md) — `PauseState`, instant freeze, timelocked unpause

Security-relevant ADRs:

- [ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) — on-chain stake accumulator (current draw mechanism; supersedes the snapshot layer of 0003/0008/0009)
- [ADR-0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md) — upgrade authority, freeze
- [ADR-0009](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md) — stake-weighted verifiable sortition (criterion retained in subtree-sum form)
