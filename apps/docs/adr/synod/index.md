# Synod — Architecture Decision Records

ADR records for the **Synod** program (the N-party dispute-escrow Arbitrable
over Accord). Synod's series is independent of Accord's and Canon's, starting
at `synod/0001`.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-synod-n-party-escrow-arbitrable-over-accord.md) | Synod — an N-party dispute-escrow Arbitrable over Accord | Accepted |
| [0002](0002-one-mint-fee-from-stake-winner-takes-pot.md) | One mint, fee-from-stake, winner takes the pot | Accepted |

## How to read them

- New to Synod: start with [0001](0001-synod-n-party-escrow-arbitrable-over-accord.md)
  (what Synod is — an Arbitrable, not an Accord-Core extension), then
  [0002](0002-one-mint-fee-from-stake-winner-takes-pot.md) (the economics),
  then `programs/synod/SPEC.md` (the implementation reference: accounts,
  instructions, state machine, invariants).
- Synod is **specified, not built** — the crate at `programs/synod` is a stub;
  the first instruction lands TDD-first. The hard Core dependency is the
  tally tie fix (bean `accord-n3vw`, Accord ADR lands with that change).

See the [ADR hub](../index.md) for the per-program convention, the
[Accord ADR series](../accord/index.md), and the
[Canon ADR series](../canon/index.md).
