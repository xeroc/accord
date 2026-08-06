# Trust Profile

> A configurable, capital-weighted Schelling arbitration oracle with off-chain
> juror indexing (liveness), externally supplied randomness, trusted
> confidential-evidence delivery, temporary privileged governance, and
> application-level enforcement.

Accord is an **arbitration oracle**, not a self-enforcing decentralized court.
It draws Jurors, collects commit-reveal votes, and emits a Ruling. Whether that
Ruling is honored is the integrating application's decision ([ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md)).
Critical power is distributed across several privileged or economically
concentrated roles. None is individually fatal and the design mitigates each,
but together they make "decentralized court" / "Kleros of Solana" an
overstatement. This page states the residual trust plainly so integrators can
price it. Source: CONCEPT-REVIEW §Ugly 8.

## What Accord is — and is not

| Claim sometimes made                            | Honest statement                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| "decentralized court"                           | A **capital-weighted Schelling arbitration oracle**. Authority and liveness rest on the roles below.                                             |
| "trustless dispute resolution"                  | **Trust-minimized** with the residual assumptions listed here. Not trustless.                                                                    |
| "no central authority"                          | No central _judge_. Rule-making, upgrade, pause, and indexing authority are held by the named roles.                                             |
| "capture is structurally impossible"            | Capture costs **≥ the security-value ceiling** (below). It is economically deterred, not structurally impossible.                                |
| "game-theoretic incentives, not trusted humans" | The Schelling equilibrium drives honest voting _conditional on an honest stake majority_. Evidence delivery and randomness are trusted/external. |

## The trust surface

Every privileged or concentrated role, what it controls, how it fails, and the
mitigation. "Residual" is what remains true after the mitigation.

| #   | Role                                                                                                                                                                  | Controls                                                                              | Failure mode                                     | Mitigation                                                                                                                | Residual assumption                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Subaccord authority** ([0005](../adr/0005-subaccord-authority-pubkey-timelock.md))                                                                                  | Pool params (windows, alpha, min stake, fee) via `propose`/`execute_subaccord_update` | Hostile param change                             | 48h on-chain timelock; anyone can front-run                                                                               | A watcher must observe and react within 48h.                                                                                                       |
| 2   | **Upgrade authority — Squads multisig** ([0007](../adr/0007-upgrade-authority-multisig-then-freeze.md))                                                               | Program code (BPF upgrade) + `pause`                                                  | Malicious/routine upgrade; panic freeze          | Multisig quorum; freeze to `None` post-audit; `unpause` is timelocked + permissionless to land                            | Until freeze, the multisig members are trusted with capital-bearing code. Freeze is a judgment call.                                               |
| 3   | **Off-chain indexer** ([0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md))                                                                | Serves Merkle paths for `stake`/`unstake`/`draw_seat`                                 | Withholds paths ⇒ staking/drawing stall          | Root is canonical on-chain; any indexer/auditor can rebuild it from `JurorStake` via `getProgramAccounts` and serve paths | Indexer is a **liveness** dependency, not correctness. At least one honest indexer must serve the pool.                                            |
| 4   | **VRF provider (magicblock)** ([0009](../adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md))                                                          | Randomness for the draw                                                               | Withholds/biases randomness                      | Commit-then-callback; result is on-chain verifiable; seed constrains selection                                            | Randomness **availability** is provider-dependent. A down/stalling oracle blocks new draws.                                                        |
| 5   | **Cranker**                                                                                                                                                           | Advances draw, voting, finalization                                                   | Liveness stall (no advance)                      | All cranks are permissionless; any actor can advance                                                                      | Someone must run the crank for disputes to progress.                                                                                               |
| 6   | **Large stakeholders**                                                                                                                                                | Draw probability (selection is stake-weighted)                                        | Majority-stake capture of a panel                | Exponential appeals (2N+1); slashing for incoherence; `active_draws` unstake lock                                         | **Honest-majority-stake assumption.** A majority coalition can capture outcomes.                                                                   |
| 7   | **Evidence Operator** ([0006](../adr/0006-evidence-onchain-hash-trusted-re-encryption-operator.md), [0011](../adr/0011-evidence-operator-daemon-offchain-service.md)) | Confidential evidence delivery to drawn Jurors                                        | Leak, selective withholding, re-encryption fraud | On-chain evidence hash; open-source daemon; per-Juror watermarking                                                        | Operator sees plaintext and is trusted not to leak or selectively serve.                                                                           |
| 8   | **Integrating application** ([0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md))                                                                      | Whether the Ruling is honored                                                         | Ignores/refuses the Ruling                       | n/a — out of protocol scope                                                                                               | Accord is an **oracle output**, not self-enforcing.                                                                                                |
| 9   | **Juror admission**                                                                                                                                                   | One key = one seat weight                                                             | Sybil (many keys, one human)                     | Stake anti-sybil + stake-weighting                                                                                        | Admission is **key-level pseudonymous**, not identity-verified independent humans ([0001](../adr/0001-schelling-accord-replaces-hired-judges.md)). |

> **Snapshot-poster role (shipped code).** The current program still exposes
> `post_snapshot` / `challenge_snapshot` / `finalize_snapshot` with a bonded
> 1-day window ([0008](../adr/0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md)).
> That role was a correctness trust dependency (proven insufficient —
> CONCEPT-REVIEW Bad 4/5). [ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md) **deletes it**: the on-chain accumulator makes the juror-set root canonical,
> so there is no poster, no bond, and no challenge window. The trust surface
> above describes the post-0012 state; the snapshot-poster row is intentionally
> absent.

## Per-Subaccord machine-readable profile

Every Subaccord exposes (directly or computably) the fields below. Integrators
read them to price trust before filing. Fields not stored on the account are
computed off-chain from public `JurorStake` state via `getProgramAccounts` — the
same path used to audit the accumulator root ([0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

```yaml
trust_profile:
  authority: <pubkey> # ADR-0005 rule-setter (48h timelock)
  upgrade_authority: <pubkey | null> # ADR-0007; multisig until post-audit freeze (null)
  paused: <bool> # PauseState singleton
  juror_admission: key_pseudonymous # NOT identity-verified humans (ADR-0001)
  staking_token: <mint>
  total_stake: <u64> # accumulator root.sum (ADR-0012)
  juror_count: <u32> # live, non-zero leaves
  stake_concentration: # computed from JurorStake
    top1_bps: <u16> #   single largest juror share (bps of total_stake)
    top5_bps: <u16>
    nakamoto_coefficient: <u32> #   smallest juror set summing to >50% of stake
  randomness:
    provider: magicblock_vrf # external (ADR-0009); commit via callback
    liveness: provider_dependent
  evidence_operator: <pubkey> # ADR-0006/0011 trusted re-encryption
  enforcement: application_level # oracle output, NOT self-enforcing (ADR-0004)
  security_value_ceiling: <u64> # cheapest rational-capture cost (see below)
```

### Field notes

- **`juror_admission: key_pseudonymous`** is constant for v1 — no Subaccord can
  claim identity-verified humans. This is the most easily missed assumption.
- **`stake_concentration`** is the integrator's sybil/majority-risk signal. A
  pool with `top1_bps ≥ 5000` (one juror ≥ 50%) is effectively single-operator.
- **`security_value_ceiling`** is the smaller of (a) the cost to bribe a
  final-round coherent majority and (b) the capital cost of a majority stake.
  File disputes only for values below this ceiling.

## Security-value ceiling (cheapest rational capture)

Accord deters capture; it does not make it structurally impossible. The two
rational attack paths and their costs:

1. **Stake majority.** Control `> 50%` of a Subaccord's stake ⇒ draw probability
   `> 50%` per seat ⇒ high probability of a captured panel. Cost ≈ market cost
   of acquiring (and maintaining/staking) that stake, **minus** the fees and
   slashed stake an attacker also controls (so the net cost can be far below
   naive `0.5 × total_stake`). Appeals raise the panel size but **not** the
   honest-majority requirement — a majority coalition stays a majority.
2. **Bribery.** Pay drawn Jurors off-chain to vote a chosen option. Undetectable
   on-chain. Cost ≈ `(⌊N/2⌋+1) × (expected_slashing + opportunity_cost)` per
   round. Appeals (2N+1) push N to 31, raising the per-round bribe bill, but a
   wealthy attacker can bribe through every appeal up to `max_appeals`.

The **security-value ceiling** is `min(stake_majority_cost, bribery_cost)`.
Disputes worth more than this should not be filed here. The honest-majority-stake
assumption is the load-bearing precondition for _every_ Schelling claim Accord
makes — including "no central authority picks judges."

## What is genuinely decentralized

- **Juror selection** is deterministic and on-chain verifiable given a committed
  VRF (the caller cannot cherry-pick; [0009](../adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md)).
- **Voting** is commit-reveal and secret until reveal — the Schelling Point forms
  independently of vote-copying.
- **Cranks** (draw, voting windows, finalization) are permissionless — no single
  operator owns dispute advancement.
- **Capital** stays fully live post-[0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)
  — no stake freeze between filing and draw.
- **The juror-set root** is canonical by construction (accumulator) — no trusted
  poster, no data-availability gap.

## Roadmap to fewer assumptions

These are deferred to v2+ and documented to avoid over-claiming:

- **Encrypted vote-tally (Arcium)** — Juror vote privacy; removes some bribery
  and coordination attacks. v2.
- **Identity / court profile** — distinct keys ≠ independent humans (Bad 1);
  a v2 identity/staking-tranche model raises the sybil cost.
- **Validity proof (SNARK) for the accumulator root** — removes the indexer
  liveness assumption by proving root correctness. The trustless destination.
- **Epoch machinery** — anchor-slot liveness without a freeze (Bad 2). v2.
- **Participation quorum / inconclusive-outcome handling** — open gap; planned
  follow-up milestone (Bad 9).
- **Evidence cryptography** — threshold PRE / TEE to remove the trusted Evidence
  Operator ([0011](../adr/0011-evidence-operator-daemon-offchain-service.md)).

See the CONCEPT-REVIEW (internal design review, not shipped in this repo) for
the full finding inventory and which items are accepted trade-offs vs. deferred
work.

## Qualifying your own claims

If you write about Accord, prefer:

- "**capital-weighted Schelling arbitration oracle**" over "decentralized court"
- "**trust-minimized**" over "trustless"
- "**drawn by VRF, selection verifiable on-chain**" over "capture is impossible"
- "**honest-majority-stake assumed**" whenever you describe Schelling honesty
