# Failed state + cancel_dispute liveness-escape crank

## Status

**Accepted.** Resolves CONCEPT-REVIEW §Ugly 4 (conceptual blocker #7: indefinite
custody on a stalled dispute).

## Context

`DisputeState` had no `Failed`/`Cancelled` terminal state, and no instruction
offered a timeout-based refund. The protocol custodies the filer's fee for the
dispute's entire life, but several liveness failures can permanently stall that
life with no recovery path:

- **No usable snapshot/VRF.** No indexer posts a root, the posted root is voided
  with no repost path (ADR-0012 moots this for the accumulator target), or the
  VRF oracle never calls back. The dispute sits in `Created`/`SnapshotPosted`
  forever.
- **A drawn round never finalizes.** Jurors never commit/reveal, or no cranker
  advances `finalize_round`/`finalize_dispute`. Drawn jurors' `active_draws`
  stay locked, freezing their stake indefinitely.

In every case the filer's fee is trapped and drawn capital is locked with no
deadline. Liveness failure was not a first-class state — a stall could last
forever.

## Decision

### 1. `DisputeState::Failed` (terminal)

Add a terminal `Failed` variant. No lifecycle instruction accepts it: every
state check (`state == X`) naturally rejects it, and the two VRF instructions
that had no state check (`request_vrf`, `commit_vrf_callback`) gain an explicit
`state != Failed` guard.

### 2. Permissionless `cancel_dispute` crank

Any cranker may cancel a dispute once its **per-stage timeout** has elapsed:

| Stage                             | States                                       | Deadline                                                                                                                   |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pre-draw (no draw yet)            | `Created`, `SnapshotPosted`                  | `filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS` (3 days)                                                                         |
| Post-draw (round never finalizes) | `Drawn`, `Commit`, `Reveal`, `RoundResolved` | `round.reveal_end + terms.appeal_window + POST_DRAW_CANCEL_GRACE_SECS` (per-Subaccord appeal window [ADR-0022] + 3d grace) |

On cancel:

1. The filer's **round-1 fee** (`terms.jurors_per_dispute · fee_per_juror`) is
   refunded from the vault, PDA-signed.
2. The current round's drawn jurors have their `active_draws` decremented
   (post-draw cancels only — pre-draw cancels have no round).
3. The dispute transitions to `Failed`.

`Final`/`Closed`/`Failed` are terminal and revert.

### 3. Timeouts as immutable program constants

The stage timeouts are compile-time constants, not `CaseTerms` fields. A
constant is immutable for a dispute's entire life by definition — a strictly
stronger freeze guarantee than snapshotting a mutable Subaccord field, with none
of the plumbing (no new `Subaccord`/`CaseTerms`/`create_subaccord`-signature
churn). v1 ships one SLA; per-Subaccord SLA configurability is deferred.

`filed_at: i64` is recorded on `Dispute` at `create_dispute` and is the
pre-draw anchor. The post-draw deadline is derived from the round's own
`reveal_end` (already stored on the `Round`), so no extra per-stage timestamp
state is needed.

## Considered Options

- **Per-stage timeouts as `CaseTerms` fields.** Rejected for v1 — requires
  growing `CaseTerms` + `Subaccord` + the `create_subaccord` argument list and
  updating every test fixture. A constant achieves the same immutability with a
  one-line declaration. Per-Subaccord SLAs are YAGNI until there is a second
  consumer.
- **Single global timeout from filing.** Rejected — a no-snapshot dispute would
  wait the full round lifecycle (review + commit + reveal + appeal) before
  cancelable, even though the stall is obvious within hours. Per-stage timeouts
  bound each stall class to its own realistic window.
- **Governance-triggered cancel.** Rejected — a permissioned escape is itself a
  liveness dependency (the authority could be unavailable). The timeout-gated
  permissionless crank is always recoverable on a known schedule.
- **Refund the full `fee_paid` (incl. appeal fees) + sweep all appeal bonds.**
  Rejected for this bean — multi-round refund precision (appellant fee/bond
  return across N rounds) is the multi-round settlement rework (bean
  `accord-r6ti`). Refunding exactly the round-1 fee never over-refunds (it is
  provably the filer's contribution) and is exact for the single-round path the
  acceptance criteria cover.

## Consequences

- **No indefinite custody.** Every non-terminal dispute has a known,
  cranker-reachable refund deadline. A dead indexer, a silent VRF oracle, or an
  absent cranker can stall — but never permanently lock — the filer's fee or
  drawn jurors' stake.
- **`Failed` is terminal.** A cancelled dispute produces no ruling; the filer
  reads `get_ruling` → `None`. For applications where "no ruling" is
  unacceptable, the fallback court must be precommitted in the original case
  terms (out of scope — application responsibility).
- **Snapshot poster bonds (pre-accumulator) are not swept on cancel.** The
  snapshot layer is superseded by ADR-0012; its bond model is mooted in the
  target architecture and intentionally not handled here.
- **Appeal-round fees/bonds are not swept on cancel.** A multi-round cancel
  leaves appeal funds in the vault; their precise return is the settlement
  rework (`accord-r6ti`). The round-1 filer fee — the only deposit the single-
  round path involves — is always refunded exactly.
- **Prior-round `active_draws`** (a pre-existing multi-round gap, `accord-r6ti`)
  are not walked; only the current round's jurors are released.

## References

- CONCEPT-REVIEW §Ugly 4 / conceptual blocker #7.
- Beans: `accord-18fb` (this); pairs with `accord-r6ti` (multi-round settlement)
  and `accord-g74z` (accumulator, which moots the snapshot stall paths).
- `state.rs` `DisputeState::Failed`, `Dispute.filed_at`; `lib.rs::cancel_dispute`.
