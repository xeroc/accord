# Security

Why the mechanism is trustworthy without reading the source.

- [Stake Accumulator](fraud-proofs.md) — why the juror-set root is canonical by construction (no posted root, bond, or fraud window)
- [Sortition & VRF](sortition-vrf.md) — committed VRF + Merkle-Sum accumulator + inflation guard
- [Circuit Breaker](circuit-breaker.md) — `PauseState`, instant freeze, timelocked unpause

Security-relevant ADRs:

- [ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) — on-chain stake accumulator (current draw mechanism; supersedes the snapshot layer of 0003/0008/0009)
- [ADR-0007](../adr/0007-upgrade-authority-multisig-then-freeze.md) — upgrade authority, freeze
- [ADR-0009](../adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md) — stake-weighted verifiable sortition (criterion retained in subtree-sum form)
