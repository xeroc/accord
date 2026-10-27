---
# accord-zhnh
title: Jurat ignores Drawn disputes — solo panels never get a verdict
status: completed
type: bug
priority: normal
created_at: 2026-10-26T15:47:24Z
updated_at: 2026-10-26T15:49:53Z
---

## Bug (user-reported, devnet)

Dispute 8e5iEDoGGk2WnBu3ELJkfkmGz7ABgNoP7v52z6oGyakr: operator 8EVB…w1 drawn (solo panel, minJurySize 1, juror_count 1, state Drawn, windows open) but jurat never surfaces the duty.

## Root cause

reconcile.ts ACTIONABLE_STATES = {Review, Commit, Reveal}. On-chain, the review phase lives in state Drawn (draw_seat sets it when the panel fills; Review is a dead enum arm nothing writes; the FIRST commit flips Drawn→Commit, commit.rs:61). With a multi-juror panel another juror's first commit makes the dispute visible; with a solo panel nobody commits first → jurat idles through the commit window → shortfall redraw loops on the same solo panel → Failed.

## Fix

- Add DisputeState.Drawn to ACTIONABLE_STATES (Drawn ⇒ windows set ⇒ dutyPhase/trackRound already correct; runDuty already waits out the review phase).
- Keep Review in the set (dead on-chain today, semantically actionable).
- Created stays excluded: partial panel, windows unset.

## TDD

- [ ] RED: reconcile.test — seated juror in a Drawn dispute yields a DutySignal
- [ ] GREEN: one-line set change + doc comment
- [ ] jurat suite green, lint clean; e2e jurat.spec green on Surfpool (comment fixes where it assumed Drawn invisible)
- [x] changeset

## Summary of Changes

- `apps/jurat/src/chain/reconcile.ts` — `DisputeState.Drawn` added to `ACTIONABLE_STATES` with the state-machine rationale in a doc comment (Review = dead on-chain arm; Created stays excluded: partial panel, windows unset). Header comment updated.
- `apps/jurat/src/chain/reconcile.test.ts` — new test: seated juror in a Drawn dispute yields a DutySignal; `Drawn` removed from the non-actionable list (pinned assumption reversed).
- `tests/src/jurat.spec.ts` — e2e asserts the duty surfaces while the dispute is STILL Drawn (before any commit); header comments corrected.
- `.changeset/jurat-drawn-duty.md` (patch).

Verified live: dispute 8e5iEDo… on devnet = state Drawn, juror_count 1, minJurySize 1, windows open, commit_count 0 — exactly the invisible-solo-panel case. `bun test` 183 pass; tsc + eslint clean; jurat.spec GREEN on Surfpool.
