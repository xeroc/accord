---
# accord-q3l5
title: "e2e — canon.spec.ts: close Removed item + re-submit after close (Surfpool green)"
status: completed
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-k4co
blocked_by:
  - accord-q8ns
---

---

assigned: tester

---

Extend `tests/src/canon.spec.ts` (Surfpool + jest + SDK facade; harness rules in AGENTS §e2e — `setup/` modules, `fetchDecoded`, no facade fetchers). Cover BOTH terminal paths into `Removed`:

## Acceptance criteria

- [x] settle-remove path → SDK `closeItem` → item account no longer decodes (closed) + closer SOL balance increased by the account's rent lamports
- [x] advance_withdrawal path → `closeItem` → same assertions
- [x] `NotRemoved` revert covered e2e (attempt close on a `Listed` item)
- [x] re-submit the same `account` after close → fresh `CanonItem` at the same PDA, `Pending`, fresh deposit, `challenge_count == 0`
- [x] whole `canon.spec.ts` GREEN via `make test` (never skipped locally)
- [x] Summary of Changes section on completion

## Summary of Changes

`tests/src/canon.spec.ts` extended from 4 → 8 tests (all GREEN on Surfpool; full jest suite 25 suites / 108 tests passed):

- **`close_item` reverts `NotRemoved` on a `Listed` item** — attempted close mid-lifecycle, asserts the revert + item untouched (still `Listed`, stake intact). Placed between `advance_pending` and `request_withdrawal` in the linear flow.
- **`close_item` on the `advance_withdrawal`-removed item** — a funded third-party caller closes the PDA; asserts the caller's SOL delta equals the item's full rent-exempt lamports exactly (tx fee is paid by `env.payer`, so the delta is pure rent), the PDA no longer decodes, and `getAccountInfo` returns null.
- **re-submit after close** — `submit_item` for the same curated `account` re-opens the freed seed: fresh `CanonItem` at the same PDA, `Pending`, `accumulated_stake == SUBMIT_DEPOSIT`, `challengeCount == 0`.
- **settle-remove path** (self-contained test, mirrors `canon.challenge.spec.ts` machinery): real `createList` CPI → `armCanonJurors` → `submit_item` → `challenge_item` (CPI create_dispute) → `forceDisputeOutcome(Failed)` → `settleItem` (item `Removed`, stake 0) → `closeItem` with the same exact-rent + account-gone assertions.

Harness rules honored: `fetchDecoded` + raw `getAccountInfo`/`getBalance` only, `setup/env.ts` `sendIx`, `draw-harness`/`synod-harness` helpers reused (no copied RPC wiring). Header comment updated to describe the close/re-submit/settle coverage.
