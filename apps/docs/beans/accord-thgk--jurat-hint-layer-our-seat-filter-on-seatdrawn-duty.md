---
# accord-thgk
title: 'Jurat — hint layer: our-seat filter on SeatDrawn → duty-received alert + kick'
status: completed
type: task
priority: normal
created_at: 2026-10-28T07:53:55Z
updated_at: 2026-10-28T08:01:38Z
---

## Context

Jurat already subscribes to Accord program logs (`src/chain/events.ts` → `subscribeAccordEvents` wired in `src/main.ts`), but the composition layer ignores the documented contract: events.ts says "the composition layer checks `juror === ourKey`" — main.ts instead kicks a full reconcile scan on EVERY `SeatDrawn` event network-wide and never surfaces the duty to the operator.

## Change

- [x] RED: `makeHintHandlers` unit tests in `src/runtime.test.ts` (our seat → duty-received alert+log+kick; foreign seat → ignored; redraw/subaccord/dispute hints → kick only)
- [x] GREEN: `makeHintHandlers(deps)` in `src/runtime.ts` — SeatDrawn filtered to our juror: log + NotifyChannel alert "duty received: seat N on dispute D (round R)" + daemon.kick(); other hints kick; onError logged
- [x] Wire it in `src/main.ts` (replaces the anonymous handlers object)
- [x] SPEC.md duty-flow/hint note matches behavior
- [x] changeset (patch, @useaccord/jurat)

## Acceptance

- `bun test` in apps/jurat green; `tsc --noEmit` + eslint clean
- Hints stay non-authoritative: membership re-verified by the reconcile scan (tracker)

## Summary of Changes

- `makeHintHandlers(deps)` in `apps/jurat/src/runtime.ts`: SeatDrawn hints filtered to our operator key → log + NotifyChannel alert "duty received: seat N on dispute D (round R)" + daemon.kick(); SubaccordCreated/Redrawn/DisputeCreated kick only; onError logged. Brings the composition layer in line with the contract `src/chain/events.ts` (and the SPEC duty-flow diagram) already documented.
- `src/main.ts` wires the factory into `subscribeAccordEvents` (replaces the anonymous kick-everything handlers).
- 4 new unit tests in `src/runtime.test.ts`; SPEC.md Chain-interface section documents the behavior; changeset `jurat-duty-received-hint.md` (patch).
- Verified: tsc --noEmit clean, eslint clean, `bun test` 237/237 green.
