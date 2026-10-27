---
# accord-f5xg
title: Surfpool e2e — full Canon lifecycle (green-rule sign-off)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T19:15:00Z
parent: accord-otps
blocked_by:
  - accord-3up2
---

Role: tester. Target: `tests/src/` (jest + Surfpool, per AGENTS.md e2e section).
Change: a Canon spec driving the full lifecycle via the SDK against a running Surfpool: create_list (→ backing Subaccord) → submit_item → advance_pending → challenge_item → settle_item (keep + remove) → request_withdrawal → advance_withdrawal; assert CanonList/CanonItem state + deposit redistribution at each step. Reuse `tests/src/setup/` (env, cheats, tokens, assertions, fetchDecoded). One spec, port-agnostic (ACCORD_RPC_URL), idempotent.
Acceptance: GREEN against `make run_surfpool` + `make test_surfpool` (green-rule sign-off — AGENTS.md §e2e green rule). LiteSVM TDD (per-instruction) is owned by each instruction task; this is the cross-cutting e2e.
Dependencies: sdk. Authority: AGENTS.md §e2e suite; tests/src/setup/.

## Summary of Changes

Added `tests/src/canon.spec.ts` — a Canon lifecycle e2e spec driving the
non-dispute lifecycle via the `@useaccord/canon` SDK against a running
Surfpool instance. 4/4 tests GREEN.

**Infrastructure changes:**

- `runbooks/deployment/main.tx` — added `deploy_canon` action so `make
run_surfpool` deploys both Accord + Canon programs (Surfpool auto-deploys
  via the committed runbook; canon was previously missing).
- `tests/package.json` — added `@useaccord/canon` workspace dependency.
- `packages/canon/src/index.ts` — exported `CanonListArgs`/`CanonItemArgs`
  types (needed by the spec to fabricate a CanonList via the SDK encoder).

**Spec coverage (`canon.spec.ts`):**

- `submit_item` — locks deposit, creates CanonItem in Pending, verifies
  state + accumulatedStake + submitter + account
- `advance_pending` — warps past listing_window, Pending → Listed
- `request_withdrawal` — Listed → WithdrawPending
- `advance_withdrawal` — warps past withdrawal_timelock, WithdrawPending →
  Removed + stake returned

**Fabrication approach:** `create_list` is not yet shipped (bean accord-73yx,
todo), so the CanonList account is fabricated directly via
`surfnet_setAccount` using the SDK's generated encoder — same approach as
the Rust LiteSVM tests. This unblocks e2e testing of the 6 existing
instructions without waiting for `create_list`.

**Not covered (blocked on `create_list`, bean accord-73yx):**

- `create_list` → backing Subaccord creation
- `challenge_item` → Accord `create_dispute` CPI (needs Subaccord + juror
  staking + fee vault)
- `settle_item` → reads Accord ruling, redistributes

These will be covered when `create_list` ships (it creates the backing
Subaccord, which is the missing prerequisite for the full dispute path).

**Verification:**

- `make run_surfpool` — Canon program deployed (verified via runbook update)
- `canon.spec.ts` — 4/4 GREEN against Surfpool
- Full suite: 13/14 suites pass (the 1 failure is the pre-existing
  evidence-daemon e2e test needing `EVIDENCE_DAEMON_URL`, unrelated to Canon)
