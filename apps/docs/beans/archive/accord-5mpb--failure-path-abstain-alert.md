---
# accord-5mpb
title: Failure path — abstain & alert
status: completed
type: task
created_at: 2026-10-15T07:32:42Z
updated_at: 2026-10-15T09:40:00Z
parent: accord-ji4v
---

src/duty/failures.ts: after retry ladder exhaustion or malformed verdict: mark duty abstained, Telegram alert with reason, no default vote ever. AC: unit tests every failure source maps to abstain+alert.

## Summary of Changes

- `apps/jurat/src/duty/types.ts` — shared duty-domain record types:
  `DutyRef`, `DutyStatus` (`open|committed|revealed|abstained`),
  `DutyFailure`, minimal `DutyRecord`, `DutyStore` persistence seam, and the
  `FAILURE_KINDS` taxonomy. Dependency-free so tracker/reveal/vote stages
  all import it; the tracker bean (accord-wryi) extends the record.
- `apps/jurat/src/duty/failures.ts` — `abstain(deps, ref, kind, reason)`:
  - Marks the duty abstained with a stamped `DutyFailure`, then fires one
    Telegram alert (`kind` + reason + dispute/round in the message).
  - Persist BEFORE alert: a Telegram outage propagates but never loses the
    durable abstention mark.
  - Missing duty record → synthesized abstained (pipeline may die before
    tracking); existing record → extended in place (tracker fields
    survive); re-abstain → newest failure wins; already-`revealed` → no-op
    (late failure must not clobber a landed vote).
  - No default vote ever, structurally: no client/instruction/vote argument
    exists on the module surface. Not DRY_RUN-gated — neither power is a
    vote-shaped tx.
- `apps/jurat/src/duty/failures.test.ts` — 7 node:test cases: every failure
  kind → abstain+alert (the AC), taxonomy completeness pin,
  persist-before-alert ordering, record synthesis, field survival,
  re-abstain, revealed-guard.
- Verified: `pnpm --filter @useaccord/jurat test` 16/16 green (9 commit +
  7 failure); `pnpm -r run build` + `pnpm -r run lint` green workspace-wide.
