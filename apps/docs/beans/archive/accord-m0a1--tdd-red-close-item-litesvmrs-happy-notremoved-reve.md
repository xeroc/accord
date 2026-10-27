---
# accord-m0a1
title: TDD RED — close_item_litesvm.rs (happy + NotRemoved reverts + rent-to-caller + re-submit roundtrip)
status: completed
type: task
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-14T19:06:45Z
parent: accord-98gr
---

---

assigned: tester

---

Write FIRST, before any implementation (RED). `programs/canon/tests/close_item_litesvm.rs`, gated `#![cfg(feature = "no-entrypoint")]`, harness mirroring `settle_item_litesvm.rs` / `withdrawal_litesvm.rs` (shared `setup()`, fixture `CanonList`/`CanonItem` builders). Design + test matrix: milestone accord-clfq HANDOFF §2/§4/§6 — do not restate here.

## Acceptance criteria

- [x] happy: fixture item in `Removed` → `close_item` succeeds → account data zeroed / no longer deserialises, caller SOL balance delta == full pre-close account lamports
- [x] `NotRemoved` revert for each of `Pending` / `Listed` / `WithdrawPending` / `Disputed`
- [x] defensive revert: `Removed` fixture with `accumulated_stake != 0` (invariant breach)
- [x] `ItemClosed` event asserted (fields: list, item, account, submitter)
- [x] suite is RED against the current program (no close_item yet), ready for the implement task to green it

## Summary of Changes

Added `programs/canon/tests/close_item_litesvm.rs` (RED): 7 tests — happy close (rent → caller minus the 5_000-lamport base fee LiteSVM charges the sole-signer caller, account wiped, `ItemClosed { list, item, account, submitter }` parsed via `anchor_litesvm::EventHelpers`), `NotRemoved` reverts for all four live states (fixtures hold their deposit, pinning the state guard ahead of the accumulated_stake guard), plus both defensive guards (`accumulated_stake != 0`, live `active_dispute` — revert + account intact; error-variant choice left to the GREEN task since HANDOFF §2/§4 diverge on the name).

Harness is fixture-only (direct `CanonItem` writes at the canonical PDA with the real derived bump): `close_item`'s context is just `{ caller, item }` — no mint/vault/submit plumbing. RED verified: `cargo test -p canon --features no-entrypoint --test close_item_litesvm --no-run` fails with exactly 3 errors, all missing `close_item` symbols (`accounts::CloseItem`, `instruction::CloseItem`, `events::ItemClosed`); no harness-side errors.

Scope note: the bean title mentions a re-submit roundtrip, but the assigned acceptance criteria don't list it — it needs a working `close_item` to exercise, so it belongs to the GREEN task (accord-kmz6, milestone DoD bullet 1) together with the submit-path plumbing it requires.
