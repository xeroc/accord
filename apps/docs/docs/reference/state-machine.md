# State Machine

`DisputeState` (defined in `state.rs`). A permissionless crank advances states when their windows elapse.

```mermaid
stateDiagram-v2
    [*] --> Created: create_dispute
    Created --> SnapshotPosted: post_snapshot
    SnapshotPosted --> Drawn: draw
    Drawn --> Commit: commit (first)
    Drawn --> RoundResolved: finalize_round (no commits)
    Commit --> Reveal: reveal (first)
    Commit --> RoundResolved: finalize_round (no reveals)
    Reveal --> RoundResolved: finalize_round
    RoundResolved --> Created: appeal (new round, current_round++)
    RoundResolved --> Final: finalize_dispute
    Final --> [*]: claim_appeal_refund (gate only)
    note right of Review: defined, no handler writes it yet
    note right of Closed: defined, no handler writes it yet
```

| From                      | To               | Trigger                                  | Window / gate                                                                                      |
| ------------------------- | ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| —                         | `Created`        | [`create_dispute`](instructions.md)      | `!paused`; `fee == jurors_per_dispute·fee_per_juror`; `staker_count >= jurors_per_dispute`         |
| `Created`                 | `SnapshotPosted` | [`post_snapshot`](instructions.md)       | poster bonds `1×max-appeal-fee`                                                                    |
| `SnapshotPosted`          | (same)           | [`challenge_snapshot`](instructions.md)  | within `challenge_deadline` (+1 day)                                                               |
| `SnapshotPosted`          | `Drawn`          | [`draw`](instructions.md)                | snapshot `Finalized`; `committed_vrf` set; `cum_before ≤ r_i < cum_after`                          |
| `Drawn`                   | `Commit`         | [`commit`](instructions.md)              | first commit; `review_end ≤ now < commit_end`                                                      |
| `Drawn`/`Commit`/`Reveal` | `RoundResolved`  | [`finalize_round`](instructions.md)      | `now ≥ reveal_end`                                                                                 |
| `Commit`                  | `Reveal`         | [`reveal`](instructions.md)              | first reveal; `commit_end ≤ now < reveal_end`                                                      |
| `RoundResolved`           | `Created`        | [`appeal`](instructions.md)              | `current_round < max_appeals`; `now < reveal_end + APPEAL_WINDOW_SECS`; `staker_count ≥ new_panel` |
| `RoundResolved`           | `Final`          | [`finalize_dispute`](instructions.md)    | `now ≥ reveal_end + APPEAL_WINDOW_SECS`                                                            |
| `Final`                   | (gate)           | [`claim_appeal_refund`](instructions.md) | `appeal_bond.amount > 0`; flips only                                                               |

Round window timeline (set at `draw`):

```
draw_time ──review_window──► review_end
            ──commit_window──► commit_end
            ──reveal_window──► reveal_end ──APPEAL_WINDOW_SECS──► appeal_deadline
```

Panel ladder (closed form `(J+1)·2^k − 1`, capped at `MAX_JURORS`):

| round_idx | panel (J=3) |
| --------- | ----------- |
| 0         | 3           |
| 1         | 7           |
| 2         | 15          |
| 3         | 31          |

Odd counts make ties impossible. See [ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md).
