# Canon — Architecture Decision Records

ADR records for the **Canon** program (the curated-list registry Arbitrable over
Accord). Canon's series is independent of Accord's, starting at `canon/0001`.

## Index

| #                                                         | Title                                                | Status                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [0001](0001-canon-curated-list-arbitrable-over-accord.md) | Accord Canon — a curated-list Arbitrable over Accord | Partially superseded (dispute-parameter ownership, by [0002](0002-per-list-court-params-at-create-list.md)) |
| [0002](0002-per-list-court-params-at-create-list.md)      | Per-list court parameters at `create_list`           | Accepted                                                                                                    |

## How to read them

- New to Canon: start with [0001](0001-canon-curated-list-arbitrable-over-accord.md)
  (what Canon is — an Arbitrable, not a court), then `programs/canon/SPEC.md`
  (the implementation reference: account model, instructions, state machine,
  Stake-Curate economics).

0001's dispute-parameter-ownership decision (Canon-enforced canonical court
defaults) is superseded by [0002](0002-per-list-court-params-at-create-list.md);
everything else in 0001 stands.

See the [ADR hub](../index.md) for the per-program convention and the
[Accord ADR series](../accord/index.md) for an example of a populated index.
