# Error Codes

`AccordError` variants (verbatim from `errors.rs`). Anchor numeric codes are sequential from the program's error base; reference by name.

## Authority / timelock ([ADR-0005](../adr/0005-subaccord-authority-pubkey-timelock.md))

| Code                 | Message                                        | Raised by                  |
| -------------------- | ---------------------------------------------- | -------------------------- |
| `Unauthorized`       | Signer is not the Subaccord authority.         | `propose_subaccord_update` |
| `ImmutableSubaccord` | Subaccord is immutable (authority == default). | `propose_subaccord_update` |
| `TimelockNotElapsed` | Timelock has not elapsed yet.                  | `execute_subaccord_update` |
| `NoPendingUpdate`    | No pending update to execute.                  | `execute_subaccord_update` |

## Circuit breaker ([ADR-0007](../adr/0007-upgrade-authority-multisig-then-freeze.md))

| Code                        | Message                                        | Raised by                           |
| --------------------------- | ---------------------------------------------- | ----------------------------------- |
| `NotPauseAuthority`         | Signer is not the pause authority.             | `pause`, `propose_unpause`          |
| `AlreadyPaused`             | Program is already paused.                     | `pause`                             |
| `NotPaused`                 | Program is not paused.                         | `propose_unpause`                   |
| `NoPendingUnpause`          | No pending unpause to execute.                 | `execute_unpause`                   |
| `UnpauseTimelockNotElapsed` | Unpause timelock has not elapsed yet.          | `execute_unpause`                   |
| `ProgramPaused`             | Program is paused; this instruction is halted. | `stake`, `create_dispute`, `appeal` |

## Staking

| Code                  | Message                                                                              | Raised by                                 |
| --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| `InsufficientStake`   | Staked amount is below the Subaccord minimum.                                        | `draw_seat`                               |
| `StakeLocked`         | Cannot unstake while active_draws > 0 (stake is frozen until drawn disputes settle). | `unstake`                                 |
| `InvalidAmount`       | Amount must be greater than zero.                                                    | `stake`, `unstake`, `claim_appeal_refund` |
| `InsufficientBalance` | Withdrawal exceeds the Juror's staked balance.                                       | `unstake`                                 |

## Dispute intake

| Code                 | Message                                                                                     | Raised by                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `InsufficientJurors` | Subaccord has fewer active distinct stakers than the required panel size.                   | `create_dispute`, `appeal`                                                                             |
| `InvalidOptions`     | Dispute options are invalid (need 2..=MAX_OPTIONS).                                         | `create_dispute`, `create_subaccord`                                                                   |
| `InvalidState`       | Dispute is not in the required state for this instruction.                                  | `draw_seat`, `commit`, `reveal`, `finalize_round`, `finalize_dispute`, `appeal`, `claim_appeal_refund` |
| `FeeMismatch`        | Tendered fee does not match the required dispute fee (jurors_per_dispute \* fee_per_juror). | `create_dispute`                                                                                       |

> The snapshot-era error codes (`SnapshotNotFinalized`, `SnapshotVoided`,
> `SnapshotChallengeWindowOpen`, `SnapshotChallengeWindowExpired`,
> `FraudProofInvalid`, `TreeNotSorted`, `OmissionProofInvalid`) are removed — the
> juror-set root is canonical by construction, so there is no posted root, bond,
> challenge window, or fraud proof ([ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

## Draw / sortition ([ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md))

| Code                     | Message                                                                      | Raised by                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DuplicateJuror`         | Draw selected a duplicate Juror.                                             | `draw_seat`                                                                |
| `InvalidMembershipProof` | Juror Merkle membership/weight proof is invalid.                             | `stake`, `unstake`, `draw_seat`, `finalize_dispute`, `claim_appeal_refund` |
| `InvalidPanelSize`       | Number of juror memberships does not match the required panel size.          | `draw_seat`, `finalize_dispute`                                            |
| `InflatedStake`          | Drawn juror's live stake is below the frozen leaf's claim (inflation guard). | `draw_seat`                                                                |
| `SortitionMismatch`      | Submitted membership does not match the VRF-derived sortition selection.     | `draw_seat`                                                                |
| `VrfAlreadyCommitted`    | VRF result already committed for this dispute.                               | `request_vrf`, `commit_vrf_callback`                                       |
| `VrfNotCommitted`        | No VRF result committed for this dispute; call commit_vrf first.             | `draw_seat`                                                                |

## Voting

| Code                  | Message                                     | Raised by          |
| --------------------- | ------------------------------------------- | ------------------ |
| `CommitAlreadyExists` | Juror has already committed.                | `commit`           |
| `CommitMissing`       | No commit to reveal for this Juror.         | `reveal`           |
| `RevealMismatch`      | Reveal does not match the committed hash.   | `reveal`           |
| `CommitWindowClosed`  | Commit window is closed.                    | `commit`           |
| `RevealWindowClosed`  | Reveal window is closed.                    | `reveal`           |
| `NotDrawnJuror`       | Signer is not a drawn Juror for this round. | `commit`, `reveal` |
| `InvalidVote`         | Revealed vote index is out of range.        | `reveal`           |
| `AlreadyRevealed`     | Juror has already revealed.                 | `reveal`           |

## Appeals / finalization ([ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md))

| Code                      | Message                                                                  | Raised by          |
| ------------------------- | ------------------------------------------------------------------------ | ------------------ |
| `AppealWindowOpen`        | Appeal window has not elapsed yet.                                       | `finalize_dispute` |
| `MaxAppealsReached`       | Maximum appeals reached for this dispute.                                | `appeal`           |
| `MaxAppealsLimitExceeded` | Subaccord max_appeals exceeds the program ceiling.                       | `create_subaccord` |
| `AppealWindowClosed`      | Appeal window has closed; the dispute can only be finalized.             | `appeal`           |
| `AppealWindowTooShort`    | Appeal window is below the per-Subaccord floor (MIN_APPEAL_WINDOW_SECS). | `create_subaccord` |
| `RoundNotFinalizable`     | Round cannot be finalized yet (window not elapsed).                      | `finalize_round`   |
| `DisputeNotFinal`         | Dispute is not in a finalizable state.                                   | (reserved)         |

## Arithmetic

| Code                 | Message              | Raised by                          |
| -------------------- | -------------------- | ---------------------------------- |
| `ArithmeticOverflow` | Arithmetic overflow. | any handler doing `checked_*` math |
