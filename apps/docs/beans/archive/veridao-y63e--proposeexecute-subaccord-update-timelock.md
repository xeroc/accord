---
# veridao-y63e
title: propose/execute_subaccord_update (timelock)
status: completed
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T03:19:27Z
parent: veridao-wyso
---

Authority-gated (signer==authority, authority!=default). propose -> PendingUpdate with execute_after_slot (48h); execute after slot elapsed. Stakers can unstake before execution. TDD: unauthorized signer revert; execute-before-deadline revert; execute-after-deadline succeeds (time travel).

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Summary of Changes

- `programs/accord/src/lib.rs` — added `propose_subaccord_update` +
  `execute_subaccord_update` + `ProposeSubaccordUpdate` /
  `ExecuteSubaccordUpdate` accounts structs (ADR-0005).
  - propose: authority-gated (`signer == authority`), no-op for immutable pools
    (`authority == default`), writes a `PendingUpdate` PDA keyed by
    `["update", subaccord, nonce]` with `execute_after_slot = slot +
    UPDATE_TIMELOCK_SLOTS` (48h). The nonce is caller-chosen; PDA `init` enforces
    uniqueness (no on-chain counter needed — matches the SPEC, which has no nonce
    field on Subaccord; the single authority tracks nonces off-chain).
  - execute: permissionless crank, reverts before the timelock
    (`TimelockNotElapsed`), applies the `UpdatePayload` to the Subaccord, and
    closes the `PendingUpdate` (`close = caller` — rent to the cranker).
- `programs/accord/tests/update_litesvm.rs` — 5 LiteSVM tests: happy propose
  (PendingUpdate + 48h execute_after_slot), unauthorized propose reverts,
  immutable-subaccord propose reverts, execute-before-deadline reverts,
  execute-after-deadline applies the payload + closes (slot time travel).

## Design decisions

- **No on-chain nonce counter.** The SPEC account table lists no `update_nonce` on
  Subaccord, and only the authority (one entity/multisig) ever proposes — so it
  tracks nonces off-chain and PDA `init` rejects reuse. Avoids a Subaccord struct
  change (which would ripple through the locked state bean + every constructor).
- **`execute` is permissionless.** The timelock is the protection, not the
  executor (same model as `execute_unpause` / `finalize_*`). Anyone can land an
  already-authority-approved, timelock-elapsed update.
- **`close = caller` on execute** returns the PendingUpdate rent to the cranker
  and prevents double-execute (the account is gone, so a second execute fails to
  load it). LiteSVM keeps the zeroed entry (0 lamports) rather than removing it,
  so the test asserts drained lamports / emptied data instead of absence.
- **No pause check** on propose/execute (ADR-0007 halts only create_dispute /
  stake / appeal). An authority can still adjust params during a freeze.

## Acceptance — MET

TDD RED->GREEN: `make test_unit` green (5 new + 31 existing = 36 tests).
`cargo fmt --check` clean; `cargo clippy --features no-entrypoint --tests` clean
(only pre-existing Anchor `cfg` macro noise). `make lint` clean.
