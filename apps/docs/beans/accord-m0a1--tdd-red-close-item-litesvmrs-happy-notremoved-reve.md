---
# accord-m0a1
title: TDD RED — close_item_litesvm.rs (happy + NotRemoved reverts + rent-to-caller + re-submit roundtrip)
status: todo
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

- [ ] happy: fixture item in `Removed` → `close_item` succeeds → account data zeroed / no longer deserialises, caller SOL balance delta == full pre-close account lamports
- [ ] `NotRemoved` revert for each of `Pending` / `Listed` / `WithdrawPending` / `Disputed`
- [ ] defensive revert: `Removed` fixture with `accumulated_stake != 0` (invariant breach)
- [ ] `ItemClosed` event asserted (fields: list, item, account, submitter)
- [ ] suite is RED against the current program (no close_item yet), ready for the implement task to green it
