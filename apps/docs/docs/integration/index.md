# Integration

File → resolve. Steps 1 and 10 are the Arbitrable's; steps 2–9 are permissionless cranks anyone may advance.

```
  Arbitrable                 Permissionless cranker            Jurors
  ──────────                 ──────────────────────            ─────
1 create_dispute  ───►  2 post_snapshot
                        3 challenge_snapshot (optional)
                        4 finalize_snapshot  ──────────►  (window passes)
                        5 request_vrf
                        6 commit_vrf_callback  ◄── VRF oracle
                        7 draw  ─────────────────────────►  8a commit
                                                          8b reveal
                        9a finalize_round
                        9b finalize_dispute  (appeal window or appeal → redo 2–9)
10 get_ruling  ◄──────────────────────────────────── (final_ruling set)
```

| #   | Instruction                                         | Caller     | Gate                           |
| --- | --------------------------------------------------- | ---------- | ------------------------------ |
| 1   | [`create_dispute`](disputes.md)                     | Arbitrable | `!paused`; fee; `staker_count` |
| 2   | [`post_snapshot`](draw-voting.md)                   | indexer    | bond `1×max-appeal-fee`        |
| 3   | [`challenge_snapshot`](../security/fraud-proofs.md) | watcher    | within 1-day window            |
| 4   | [`finalize_snapshot`](draw-voting.md)               | crank      | challenge window elapsed       |
| 5   | [`request_vrf`](draw-voting.md)                     | crank      | snapshot finalized             |
| 6   | `commit_vrf_callback`                               | VRF oracle | identity-constrained           |
| 7   | [`draw`](draw-voting.md)                            | crank      | MST proofs + sortition         |
| 8a  | [`commit`](draw-voting.md)                          | Juror      | commit window                  |
| 8b  | [`reveal`](draw-voting.md)                          | Juror      | reveal window                  |
| 9a  | [`finalize_round`](draw-voting.md)                  | crank      | `reveal_end` passed            |
| 9b  | [`finalize_dispute`](draw-voting.md)                | crank      | appeal window passed           |
| 10  | [`get_ruling`](get-ruling.md)                       | Arbitrable | read-only, anytime             |

Integrator entry points: [Arbitrable interface](arbitrable-interface.md) · [Subaccords](subaccords.md) · [Staking](staking.md) · [Disputes](disputes.md) · [Draw & voting](draw-voting.md) · [Appeals](appeals.md) · [Ruling](get-ruling.md).

Why: [ADR-0001](../adr/0001-schelling-accord-replaces-hired-judges.md) (Schelling), [ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md) (party-agnostic).
