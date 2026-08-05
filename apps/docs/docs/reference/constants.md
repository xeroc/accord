# Constants

From `constants.rs`. PDA seed prefixes are the literal `&[u8]` bytes prefixed to seed derivations.

## Size ceilings

| Constant      | Value | Notes                                                                    |
| ------------- | ----- | ------------------------------------------------------------------------ |
| `MAX_JURORS`  | `31`  | Panel ceiling = 3rd-appeal panel. Bounds `Round.jurors/commits/reveals`. |
| `MAX_APPEALS` | `3`   | Program ceiling on appeals per dispute. Ladder 3→7→15→31.                |
| `MAX_OPTIONS` | `32`  | Max vote options per Dispute. Bounds `Dispute.options`. Minimum 2.       |

## Timelocks & windows

| Constant                         | Value     | Unit / Notes                                                                                                                   |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UPDATE_TIMELOCK_SLOTS`          | `432_000` | slots (~48h @ 400ms mainnet). Subaccord param update. [ADR-0005](../adr/0005-subaccord-authority-pubkey-timelock.md)           |
| `SNAPSHOT_CHALLENGE_WINDOW_SECS` | `86_400`  | seconds (1 day). Fraud-proof window. [ADR-0003](../adr/0003-accord-draw-merkle-snapshot-distinct-vrf.md)                       |
| `APPEAL_WINDOW_SECS`             | `259_200` | seconds (3 days). RoundResolved → appeal-or-finalize.                                                                          |
| `UNPAUSE_TIMELOCK_SLOTS`         | `216_000` | slots (~24h @ 400ms). `propose_unpause` → `execute_unpause`. [ADR-0007](../adr/0007-upgrade-authority-multisig-then-freeze.md) |

## PDA seed prefixes

| Constant              | Bytes          | Used by                  |
| --------------------- | -------------- | ------------------------ |
| `SEED_SUBACCORD`      | `b"subaccord"` | `Subaccord`              |
| `SEED_JUROR_STAKE`    | `b"stake"`     | `JurorStake`             |
| `SEED_DISPUTE`        | `b"dispute"`   | `Dispute`                |
| `SEED_ROUND`          | `b"round"`     | `Round`                  |
| `SEED_SNAPSHOT`       | `b"snapshot"`  | `Snapshot`               |
| `SEED_PENDING_UPDATE` | `b"update"`    | `PendingUpdate`          |
| `SEED_APPEAL_BOND`    | `b"bond"`      | `AppealBond`             |
| `SEED_PAUSE`          | `b"pause"`     | `PauseState` (singleton) |

## v1 default economics (per-Subaccord configurable)

| Constant                     | Value     | Notes                                                                 |
| ---------------------------- | --------- | --------------------------------------------------------------------- |
| `DEFAULT_JURORS_PER_DISPUTE` | `3`       | Round-0 panel.                                                        |
| `DEFAULT_ALPHA_BPS`          | `1_000`   | 10% slash factor. `incoherent_loss = alpha_bps · min_stake / 10_000`. |
| `DEFAULT_REVIEW_WINDOW_SECS` | `604_800` | 7 days.                                                               |
| `DEFAULT_COMMIT_WINDOW_SECS` | `172_800` | 2 days.                                                               |
| `DEFAULT_REVEAL_WINDOW_SECS` | `172_800` | 2 days.                                                               |
| `DEFAULT_MAX_APPEALS`        | `3`       | Caps at `MAX_APPEALS`.                                                |

Program ID: `RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe`
