---
# veridao-63v3
title: pause/unpause circuit breaker
status: completed
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T04:35:00Z
parent: veridao-wyso
---

Multisig-gated (signer==upgrade-authority/multisig). pause instant; unpause timelocked. Halts new create_dispute/stake/appeal; in-flight disputes resolve. TDD: unauthorized revert; pause+unpause flow.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Design decisions

- **Singleton `PauseState`** (seeds `["pause"]`, added to `state.rs`): `authority`,
  `paused: bool`, `pending_unpause_after: Option<u64>` (slot), `bump`. The SPEC
  account table omits a pause account; ADR-0007 requires it.
- **`initialize_pause`** is one-time `init`; the caller becomes the pause authority
  (the Squads multisig / upgrade authority). Call at deploy; front-running is an
  ops concern (bundle with deploy). v2 may gate init on the BPF upgrade authority.
- **`pause()`** is instant + authority-gated, and cancels any pending unpause.
- **`unpause` is timelocked via propose/execute** (mirrors ADR-0005's pattern):
  `propose_unpause` (authority) arms `pending_unpause_after = slot + UNPAUSE_TIMELOCK_SLOTS`;
  `execute_unpause` is a **permissionless crank** that lands once the notice slot
  passes. So a freeze is always recoverable on a known schedule ("cannot be held
  indefinitely without notice", ADR-0007). `UNPAUSE_TIMELOCK_SLOTS = 24h`.
- **Halt enforcement** (`require!(!pause_state.paused, ProgramPaused)`) lives inside
  each of `create_dispute` / `stake` / `appeal`; those instruction beans read the
  PauseState PDA and add the guard. This bean owns only the breaker itself.

## Summary of Changes

- `programs/accord/src/state.rs` — `PauseState` account (`#[derive(InitSpace)]`).
- `programs/accord/src/constants.rs` — `UNPAUSE_TIMELOCK_SLOTS`, `SEED_PAUSE`.
- `programs/accord/src/errors.rs` — `NotPauseAuthority`, `AlreadyPaused`,
  `NotPaused`, `NoPendingUnpause`, `UnpauseTimelockNotElapsed`, `ProgramPaused`.
- `programs/accord/src/events.rs` — `Paused`, `UnpauseProposed`, `Unpaused`.
- `programs/accord/src/lib.rs` — `initialize_pause`, `pause`, `propose_unpause`,
  `execute_unpause` instructions + their `#[derive(Accounts)]` contexts (canonical
  bump reuse; `init` for the singleton).
- `programs/accord/tests/pause_litesvm.rs` — 4 LiteSVM tests: full
  pause→propose→warp→execute flow (incl. the `expire_blockhash()` discipline for
  multi-tx tests per litesvm.md §2e), non-authority pause revert, double-pause
  revert, propose-while-unpaused revert.

## Acceptance — MET

TDD RED->GREEN: `make test_unit` green (test_id, health_round_trips, +8 state,
+4 pause = 14 tests). `cargo build-sbf --tools-version v1.52` clean; `cargo fmt`
clean; `cargo clippy` clean (only pre-existing Anchor `cfg` macro noise).

## Notes for sibling instruction beans

- `create_dispute` / `stake` / `appeal` must add the PauseState PDA to their
  account context and guard with `require!(!pause_state.paused, ProgramPaused)`.
- In-flight disputes (draw/commit/reveal/finalize) are NOT halted — only intake +
  capital + escalation freeze, so existing disputes resolve.
