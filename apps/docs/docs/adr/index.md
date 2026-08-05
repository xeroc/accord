# Architecture Decision Records

The design decisions behind the Accord. Each ADR captures the context,
options considered, and consequences of a locked architectural choice.

ADRs are **immutable once deployed**. A superseded decision gets a new ADR
that references the old one.

## Index

| #                                                                             | Title                                                                                | Status                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [0001](0001-schelling-accord-replaces-hired-judges.md)                        | Schelling-point Accord replaces hired-judge committee                                | Accepted                                                                                        |
| [0002](0002-per-subaccord-staking-token-no-accord-token-v1.md)                | Per-Subaccord staking token, no Accord token in v1                                   | Accepted                                                                                        |
| [0003](0003-accord-draw-merkle-snapshot-distinct-vrf.md)                      | Draw — Merkle Snapshot, off-chain sortition, distinct Jurors                         | Partially superseded by [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) |
| [0004](0004-accord-party-agnostic-permissionless-appeal.md)                   | Party-agnostic; appeal is permissionless                                             | Accepted                                                                                        |
| [0005](0005-subaccord-authority-pubkey-timelock.md)                           | Subaccord authority — pubkey-gated, 48h timelock                                     | Accepted                                                                                        |
| [0006](0006-evidence-onchain-hash-trusted-re-encryption-operator.md)          | Evidence — on-chain hash, trusted re-encryption operator                             | Accepted                                                                                        |
| [0007](0007-upgrade-authority-multisig-then-freeze.md)                        | Upgrade authority — Squads multisig, then post-audit freeze                          | Accepted                                                                                        |
| [0008](0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md) | Snapshot trust hardening — anchor-slot pattern, fraud predicates, sortition          | Partially superseded by [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) |
| [0009](0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md)         | Stake-weighted verifiable sortition — MST, committed VRF                             | Partially superseded by [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) |
| [0010](0010-sdk-codama-solana-kit-facade.md)                                  | `@accord/sdk` — Codama codegen + Solana Kit + custom facade                          | Accepted                                                                                        |
| [0011](0011-evidence-operator-daemon-offchain-service.md)                     | Evidence Operator Daemon — off-chain decrypt-re-encryption service                   | Accepted                                                                                        |
| [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)       | On-chain stake accumulator replaces the optimistic snapshot (resolves Bad 4 + Bad 5) | Proposed                                                                                        |
| [0013](0013-pause-scope-split-contains-new-exposure-never-adjudication.md)    | Pause scope — split: pause contains new exposure, never adjudication (amends 0007)   | Accepted                                                                                        |

## How to read them

- **New to the project**: start with [0001](0001-schelling-accord-replaces-hired-judges.md)
  (why Schelling-point), then [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)
  (how the draw works today — on-chain stake accumulator). 0003 / 0008 / 0009 are
  the historical draw/snapshot ADRs, now partially superseded by 0012 — read them
  for the original design and the trust-model evolution, not as the current spec.
- **Integrating**: 0001 + 0004 (party-agnostic) + 0005 (Subaccord authority) are
  the most relevant to your integration surface.
- **Auditing**: [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)
  is the security-critical draw ADR — it makes the juror-set root canonical by
  construction (no posted root to withhold, sums bound into node hashes),
  resolving CONCEPT-REVIEW Bad 4 + Bad 5. It **supersedes the snapshot layer of
  0003/0008/0009**: the poster/bond/1-day-window and all fraud predicates are
  deleted; the draw-time inflation guard and the stake-weighted sortition
  criterion (in subtree-sum form) are retained.

## Authoring a new ADR

1. Number = next sequential (e.g., 0010).
2. Follow the format: `# Title` → decision statement → `## Considered Options`
   → `## Consequences`.
3. Move to `apps/docs/docs/adr/` via `git mv` (or create in place).
4. Add to the table above.
5. Reference related ADRs and beans.
