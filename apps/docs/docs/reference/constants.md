# Constants

From `constants.rs`. PDA seed prefixes are the literal `&[u8]` bytes prefixed to seed derivations.

## Size ceilings

| Constant      | Value | Notes                                                                    |
| ------------- | ----- | ------------------------------------------------------------------------ |
| `MAX_JURORS`  | `31`  | Panel ceiling = 3rd-appeal panel. Bounds `Round.jurors/commits/reveals`. |
| `MAX_APPEALS` | `3`   | Program ceiling on appeals per dispute. Ladder 3→7→15→31.                |
| `MAX_OPTIONS` | `8`   | Max vote options per Dispute. Bounds `Dispute.options`. Plurality disputes file `2..=8`; Median (scalar) disputes file none ([ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)). |

## Timelocks & windows

| Constant                     | Value     | Unit / Notes                                                                                                                                                                              |
| ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPDATE_TIMELOCK_SLOTS`      | `432_000` | slots (~48h @ 400ms mainnet). Subaccord param update. [ADR-0005](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0005-subaccord-authority-pubkey-timelock.md)                                                                      |
| `DEFAULT_APPEAL_WINDOW_SECS` | `259_200` | seconds (3 days). **Default** appeal window — the runtime value is the per-Subaccord `terms.appealWindow` ([ADR-0022](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0022-per-subaccord-configurable-appeal-window.md)).          |
| `MIN_APPEAL_WINDOW_SECS`     | `3_600`   | seconds (1 hour). Per-Subaccord floor ([ADR-0022](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0022-per-subaccord-configurable-appeal-window.md)). `appeal_window == 0` rejected; use `max_appeals == 0` for no-appeals intent. |
| `UNPAUSE_TIMELOCK_SLOTS`     | `216_000` | slots (~24h @ 400ms). `propose_unpause` → `execute_unpause`. [ADR-0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md)                                                            |

> The `SNAPSHOT_CHALLENGE_WINDOW_SECS` (1-day fraud window) is removed — the
> juror-set root is canonical by construction ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

## PDA seed prefixes

| Constant              | Bytes          | Used by                  |
| --------------------- | -------------- | ------------------------ |
| `SEED_SUBACCORD`      | `b"subaccord"` | `Subaccord`              |
| `SEED_JUROR_STAKE`    | `b"stake"`     | `JurorStake`             |
| `SEED_DISPUTE`        | `b"dispute"`   | `Dispute`                |
| `SEED_ROUND`          | `b"round"`     | `Round`                  |
| `SEED_PENDING_UPDATE` | `b"update"`    | `PendingUpdate`          |
| `SEED_APPEAL_BOND`    | `b"bond"`      | `AppealBond`             |
| `SEED_ACCORD_STATE`          | `b"state"`     | `AccordState` (singleton) |

> `SEED_SNAPSHOT` (`b"snapshot"`) is removed — there is no `Snapshot` account ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

## v1 default economics (per-Subaccord configurable)

| Constant                     | Value     | Notes                                                                                                      |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `DEFAULT_JURORS_PER_DISPUTE` | `3`       | Round-0 panel.                                                                                             |
| `DEFAULT_ALPHA_BPS`          | `1_000`   | 10% slash factor. `incoherent_loss = alpha_bps · min_stake / 10_000`.                                      |
| `DEFAULT_REVIEW_WINDOW_SECS` | `604_800` | 7 days.                                                                                                    |
| `DEFAULT_COMMIT_WINDOW_SECS` | `172_800` | 2 days.                                                                                                    |
| `DEFAULT_REVEAL_WINDOW_SECS` | `172_800` | 2 days.                                                                                                    |
| `DEFAULT_APPEAL_WINDOW_SECS` | `259_200` | 3 days. Per-Subaccord appeal window ([ADR-0022](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0022-per-subaccord-configurable-appeal-window.md)). |
| `DEFAULT_MAX_APPEALS`        | `3`       | Caps at `MAX_APPEALS`.                                                                                     |
| `DEFAULT_COHERENCE_TOL_BPS`  | `100`     | Median coherence band = ±1% of the final median (`0` = exact, ceiling `10_000`; inert for Plurality; [ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)). |

Program ID: `RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe`
