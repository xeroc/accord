# Circuit Breaker

`PauseState` singleton (`["pause"]`). Instant freeze, timelocked recovery.

## Surface

| Instruction        | Caller              | Effect                                                               |
| ------------------ | ------------------- | -------------------------------------------------------------------- |
| `initialize_pause` | deployer (one-time) | Sets `authority`; caller becomes pause authority.                    |
| `pause`            | `authority`         | `paused = true`; clears any pending unpause. **Instant.**            |
| `propose_unpause`  | `authority`         | Arms `pending_unpause_after = slot + UNPAUSE_TIMELOCK_SLOTS` (~24h). |
| `execute_unpause`  | any cranker         | Lands unpause once notice slot passes. **No authority check.**       |

## While `paused == true`

| Instruction        | Behaviour                                             |
| ------------------ | ----------------------------------------------------- |
| `create_dispute`   | reverts `ProgramPaused`                               |
| `stake`            | reverts `ProgramPaused`                               |
| `appeal`           | reverts `ProgramPaused`                               |
| `unstake`          | **allowed** — capital is never trapped                |
| in-flight disputes | **resolve normally** (all cranks + voting unaffected) |

## Recovery guarantee

The unpause is permissionless on a known schedule: once `propose_unpause` has armed `pending_unpause_after`, any caller may land `execute_unpause` after that slot. A frozen program is always recoverable; the authority cannot hold it hostage past the notice window.

```mermaid
stateDiagram-v2
    [*] --> Running: initialize_pause
    Running --> Paused: pause (authority)
    Paused --> Paused: propose_unpause arms slot
    Paused --> Running: execute_unpause (anyone, slot passed)
    note right of Paused: create_dispute/stake/appeal halt; unstake + in-flight OK
```

Why: [ADR-0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md) (Squads multisig → post-audit freeze). Constant: [`UNPAUSE_TIMELOCK_SLOTS`](../reference/constants.md).
