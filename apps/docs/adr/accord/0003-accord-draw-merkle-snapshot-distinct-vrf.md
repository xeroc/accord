# Accord juror draw — Merkle Snapshot, off-chain sortition, distinct Jurors, VRF

> **Partially superseded by [ADR-0012](0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md).**
> The snapshot / poster / bond / 1-day fraud-proof-window layer is replaced by a
> live on-chain stake accumulator (canonical root by construction — no posted
> root to withhold or fabricate, no challenge surface). **Retained:** the
> draw-over-Merkle intent, **distinct Jurors**, and VRF-driven sortition — now
> stake-weighted in subtree-sum form over a root frozen at VRF-commit. The
> `active_draws` unstake lock is also retained.

Jurors are drawn for a Dispute from a Merkle-rooted Snapshot of the Subaccord's Juror set and cumulative stakes, committed optimistically at Dispute creation and protected by a 1-day fraud-proof window (poster bonds 1× the Dispute's max appeal fee). The draw consumes VRF to select N **distinct** Jurors via a cumulative-stake lookup, proving each membership on-chain. This is the only option that scales to an unbounded Juror pool within Solana's account/compute limits without an O(n) write on every stake.

## Considered Options

- **Capped on-chain roster + weighted draw (Kleros-style):** simplest and fully on-chain, but caps each Subaccord (~256 Jurors) and lets one Juror hold multiple slots (weight). Rejected for v1 — the cap is a real ceiling and the project chose to build for scale from day one.
- **On-chain paginated Juror ledger:** no cap, but a heavy write on every stake/unstake and high complexity.
- **Per-dispute draw via `remaining_accounts`:** blows the 128-account / compute limit past ~64 Jurors.

## Consequences

- An off-chain indexer is required to produce the Snapshot root; the fraud-proof is the trust anchor.
- Distinct Jurors (weight always 1) flatten the coherence slash to a per-Juror `α · min_stake`, so a whale drawn once risks the same absolute slash as a minimum staker — a weaker per-draw whale signal than Kleros's weighted model. Accepted for v1; revisit if dispute data shows whale misbehaviour.
- Unstake is gated by a per-Juror `active_draws` counter: stake is frozen (Kleros §4.2.2) until every Dispute a Juror was drawn into reaches a final Ruling.
