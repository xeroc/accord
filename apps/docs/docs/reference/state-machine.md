# State Machine

`DisputeState` (defined in `state.rs`). A permissionless crank advances states when their windows elapse.

```mermaid
stateDiagram-v2
    [*] --> Created: create_dispute
    Created --> Drawn: commit_vrf_callback (freezes root) + draw_seat × N
    Drawn --> Commit: commit (first)
    Drawn --> RoundResolved: finalize_round (no commits)
    Commit --> Reveal: reveal (first)
    Commit --> RoundResolved: finalize_round (no reveals)
    Reveal --> RoundResolved: finalize_round
    RoundResolved --> Created: appeal (current_round++, new evidence slot, same frozen root)
    RoundResolved --> Final: finalize_dispute
    Final --> [*]: claim_appeal_refund (gate only)
    note right of Review: defined, no handler writes it yet
    note right of Closed: defined, no handler writes it yet
```

| From                      | To              | Trigger                                                                       | Window / gate                                                                                                                                                                                                                                                           |
| ------------------------- | --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                         | `Created`       | [`create_dispute`](instructions.md)                                           | `!paused`; `fee == jurors_per_dispute·fee_per_juror`; `staker_count >= jurors_per_dispute`                                                                                                                                                                              |
| `Created`                 | `Drawn`         | [`commit_vrf_callback`](instructions.md) + [`draw_seat`](instructions.md) × N | `committed_vrf` + `frozen_root` set; `prefix ≤ r_i < prefix + stake` per seat                                                                                                                                                                                           |
| `Drawn`                   | `Commit`        | [`commit`](instructions.md)                                                   | first commit; `review_end ≤ now < commit_end`                                                                                                                                                                                                                           |
| `Drawn`/`Commit`/`Reveal` | `RoundResolved` / `RedrawEligible` | [`finalize_round`](instructions.md)                            | `now ≥ reveal_end` ∨ all revealed; quorum met **and** decisive tally → `RoundResolved`; shortfall ∨ Plurality top-count tie ([ADR-0026](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0026-plurality-tie-non-decisive-redraw.md)) → `RedrawEligible`                                                                    |
| `Commit`                  | `Reveal`        | [`commit`](instructions.md) (panel-full) / [`reveal`](instructions.md) (first) | panel-full `commit` flips early; else first reveal: `commit_end ≤ now < reveal_end` ∨ all committed                                                                                                                                                                    |
| `RoundResolved`           | `Created`       | [`appeal`](instructions.md)                                                   | `current_round < max_appeals`; `now < reveal_end + terms.appeal_window`; `staker_count ≥ new_panel`. Writes `new_evidence_hash` → `evidence_hashes[current_round + 1]` (the new round; `[0u8;32]` = reuse prior; [ADR-0023](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0023-per-round-evidence-hashes.md)). |
| `RoundResolved`           | `Final`         | [`finalize_dispute`](instructions.md)                                         | `now ≥ reveal_end + terms.appeal_window`                                                                                                                                                                                                                                |
| `Final`                   | (gate)          | [`claim_appeal_refund`](instructions.md)                                      | `appeal_bond.amount > 0`; flips only                                                                                                                                                                                                                                    |

Round window timeline (set at `draw`):

```
draw_time ──review_window──► review_end
            ──commit_window──► commit_end
            ──reveal_window──► reveal_end ──terms.appeal_window──► appeal_deadline
```

Panel ladder (closed form `(J+1)·2^k − 1`, capped at `MAX_JURORS`):

| round_idx | panel (J=3) |
| --------- | ----------- |
| 0         | 3           |
| 1         | 7           |
| 2         | 15          |
| 3         | 31          |

Odd counts make full-reveal **binary** ties impossible; multi-option tallies and non-reveal splits can still tie, and a Plurality top-count tie routes to `RedrawEligible` (redraw / `Failed` on exhaustion, [ADR-0026](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0026-plurality-tie-non-decisive-redraw.md)). The appeal window is per-Subaccord (`terms.appeal_window`, [ADR-0022](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0022-per-subaccord-configurable-appeal-window.md)). Evidence is per-round: `create_dispute` writes `evidence_hashes[0]`, each `appeal` writes the new round's slot (`[0u8;32]` sentinel = reuse prior; [ADR-0023](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0023-per-round-evidence-hashes.md)). See [ADR-0004](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0004-accord-party-agnostic-permissionless-appeal.md).
