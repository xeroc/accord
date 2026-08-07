# Accord — Architecture Decision Records

The design decisions behind the **Accord** arbitration program. Each ADR
captures the context, options considered, and consequences of a locked
architectural choice.

ADRs are **immutable once deployed**. A superseded decision gets a new ADR
that references the old one; the old ADR's body is left intact and only its
status banner is annotated.

> These ADRs are **repo-only** (not served by the docs site). They live at
> `apps/docs/adr/accord/`. The sibling [Canon](../canon/index.md) program keeps
> its own ADR series. See the [ADR hub](../index.md) for the convention.

## Index

| #                                                                             | Title                                                                                                     | Status               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------- |
| [0001](0001-schelling-accord-replaces-hired-judges.md)                        | Schelling-point Accord replaces hired-judge committee                                                     | Accepted             |
| [0002](0002-per-subaccord-staking-token-no-accord-token-v1.md)                | Per-Subaccord staking token, no Accord token in v1                                                        | Accepted             |
| [0003](0003-accord-draw-merkle-snapshot-distinct-vrf.md)                      | Draw — Merkle Snapshot, off-chain sortition, distinct Jurors                                              | Partially superseded |
| [0004](0004-accord-party-agnostic-permissionless-appeal.md)                   | Party-agnostic; appeal is permissionless                                                                  | Accepted             |
| [0005](0005-subaccord-authority-pubkey-timelock.md)                           | Subaccord authority — pubkey-gated, 48h timelock                                                          | Accepted             |
| [0006](0006-evidence-onchain-hash-trusted-re-encryption-operator.md)          | Evidence — on-chain hash, trusted re-encryption operator                                                  | Accepted             |
| [0007](0007-upgrade-authority-multisig-then-freeze.md)                        | Upgrade authority — Squads multisig, then post-audit freeze                                               | Accepted             |
| [0008](0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md) | Snapshot trust hardening — anchor-slot pattern, fraud predicates, sortition                               | Partially superseded |
| [0009](0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md)         | Stake-weighted verifiable sortition — MST, committed VRF                                                  | Partially superseded |
| [0010](0010-sdk-codama-solana-kit-facade.md)                                  | `@accord/sdk` — Codama codegen + Solana Kit + custom facade                                               | Accepted             |
| [0011](0011-evidence-operator-daemon-offchain-service.md)                     | Evidence Operator Daemon — off-chain decrypt-re-encryption service                                        | Accepted             |
| [0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)       | On-chain stake accumulator replaces the optimistic snapshot (resolves Bad 4 + Bad 5)                      | Proposed             |
| [0013](0013-vrf-authentication-via-oracle-callback.md)                        | VRF authentication via oracle callback — supersedes the ADR-0009 caller-commit VRF                        | Accepted             |
| [0014](0014-failed-state-cancel-dispute-escape-hatch.md)                      | Failed state + `cancel_dispute` liveness-escape crank                                                     | Accepted             |
| [0015](0015-evidence-crypto-protocol-in-sdk.md)                               | Evidence crypto protocol lives in `@accord/sdk` — shared by claimant, operator, juror (amends 0011)       | Accepted             |
| [0016](0016-pause-scope-split-contains-new-exposure-never-adjudication.md)    | Pause scope — split: pause contains new exposure, never adjudication (amends 0007)                        | Accepted             |
| [0017](0017-evidence-data-format-manifest-yaml.md)                            | Evidence data format — `manifest.yaml` Merkle root, salted option labels                                  | Accepted             |
| [0018](0018-multi-round-settlement-against-final-ruling.md)                   | Multi-round settlement against the final ruling                                                           | Accepted             |
| [0019](0019-subaccord-dispute-kit-aggregation-enum-fixed-panel-ladder.md)     | Subaccord dispute-kit — aggregation enum; round-1 panel fixed at 3 (`max_appeals` is the sole panel knob) | Accepted             |

### Supersession map

- **0012** supersedes the snapshot layer of **0003 / 0008 / 0009** (retains the
  draw-over-Merkle intent, distinct Jurors, and the subtree-sum sortition
  criterion; drops the anchor-slot witness / `last_change_slot` and the four
  fraud predicates). An on-chain accumulator makes the root canonical, dissolving
  the data-availability and sum-authentication gaps.
- **0013** supersedes the caller-supplied `commit_vrf(vrf_result)` VRF-delivery
  design in **0009 §2** and the **0008** addendum (shipped as an
  oracle-authenticated callback); the split-transaction rationale is retained.
- **0016** amends **0007** (pause scope: pausing must not consume appeal
  deadlines).
- **0015** amends **0011** (evidence crypto lives in the SDK, not the daemon).

## How to read them

- **New to the project**: start with [0001](0001-schelling-accord-replaces-hired-judges.md)
  (why Schelling-point), then [0003](0003-accord-draw-merkle-snapshot-distinct-vrf.md)
  (how the draw works), then [0008](0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md)
  and [0009](0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md) (how
  the snapshot trust model was hardened, then superseded by 0012).
- **Integrating**: 0001 + 0004 (party-agnostic) + 0005 (Subaccord authority) are
  the most relevant to your integration surface.
- **Auditing**: 0008 + 0009 + 0012 are the security-critical ADRs (snapshot fraud
  proofs → canonical accumulator, sortition enforcement, VRF integration).

## Authoring a new Accord ADR

1. Number = next sequential (currently **0020**).
2. Follow the format: `# Title` → decision statement → `## Considered Options`
   → `## Consequences`.
3. Add the file here via `git mv` (or create in place) at
   `apps/docs/adr/accord/`.
4. Add a row to the table above.
5. Reference related ADRs and beans.
