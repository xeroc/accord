# Integration

File → resolve. Steps 1 and 9 are the Arbitrable's; steps 2–8 are permissionless cranks anyone may advance.

```
  Arbitrable                 Permissionless cranker            Jurors
  ──────────                 ──────────────────────            ─────
1 create_dispute  ───►  2 request_vrf
                        3 commit_vrf_callback  ◄── VRF oracle  (also freezes dispute.frozen_root)
                        4 draw_seat × N  ──────────────────►  5a commit
                                                           5b reveal
                        6a finalize_round
                        6b finalize_dispute  (appeal window or appeal → redo 2–6)
9 get_ruling  ◄──────────────────────────────────── (final_ruling set)
```

| #   | Instruction                          | Caller     | Gate                                                         |
| --- | ------------------------------------ | ---------- | ------------------------------------------------------------ |
| 1   | [`create_dispute`](disputes.md)      | Arbitrable | `!paused`; fee; `staker_count`                               |
| 2   | [`request_vrf`](draw-voting.md)      | crank      | `committed_vrf.is_none()`                                    |
| 3   | `commit_vrf_callback`                | VRF oracle | identity-constrained; writes `committed_vrf` + `frozen_root` |
| 4   | [`draw_seat`](draw-voting.md)        | crank      | MST proof + sortition vs `frozen_root` (one tx per seat)     |
| 5a  | [`commit`](draw-voting.md)           | Juror      | commit window                                                |
| 5b  | [`reveal`](draw-voting.md)           | Juror      | reveal window                                                |
| 6a  | [`finalize_round`](draw-voting.md)   | crank      | `reveal_end` passed ∨ all revealed                           |
| 6b  | [`finalize_dispute`](draw-voting.md) | crank      | appeal window passed                                         |
| 9   | [`get_ruling`](get-ruling.md)        | Arbitrable | read-only, anytime                                           |

Integrator entry points: [Arbitrable interface](arbitrable-interface.md) · [Subaccords](subaccords.md) · [Staking](staking.md) · [Disputes](disputes.md) · [Draw & voting](draw-voting.md) · [Appeals](appeals.md) · [Ruling](get-ruling.md).

Why: [ADR-0001](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0001-schelling-accord-replaces-hired-judges.md) (Schelling), [ADR-0004](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0004-accord-party-agnostic-permissionless-appeal.md) (party-agnostic). Draw mechanism: [ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md).
