# Security

Why the mechanism is trustworthy without reading the source.

- [Snapshot Fraud Proofs](fraud-proofs.md) — the 5 on-chain-verifiable predicates
- [Sortition & VRF](sortition-vrf.md) — committed VRF + Merkle-Sum Tree + inflation guard
- [Circuit Breaker](circuit-breaker.md) — `PauseState`, instant freeze, timelocked unpause

Security-relevant ADRs:

- [ADR-0003](../adr/0003-accord-draw-merkle-snapshot-distinct-vrf.md) — draw, snapshot, distinct jurors
- [ADR-0007](../adr/0007-upgrade-authority-multisig-then-freeze.md) — upgrade authority, freeze
- [ADR-0008](../adr/0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md) — anchor-slot, fraud predicates, sortition
- [ADR-0009](../adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md) — stake-weighted verifiable sortition, MST, committed VRF
