---
# accord-qg1w
title: Reconcile scans
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T10:02:00Z
parent: accord-24o6
---

src/chain/reconcile.ts — on boot + interval: getProgramAccounts(Subaccord) → join candidates; open disputes → Round.jurors contains our key ⇒ DutySignal. Idempotent. AC: unit tests with mocked accounts; missed-event catch-up covered.

## Summary of Changes

- `apps/jurat/src/chain/reconcile.ts`:
  - `reconcile(chain, juror)` — one authoritative scan over the `ReconcileChain` seam (real impl: `findAllSubaccords` / `findAllDisputes` / `findRoundPda`+fetch, bean accord-lii9): every Subaccord → `JoinCandidate`; every dispute in an actionable state (Review / Commit / Reveal — the states a seated juror acts in, mirroring SDK `disputePhase`) whose current Round panel contains our key → `DutySignal` (dispute, subaccord, roundIdx = `dispute.currentRound`, jurorIndex, state). Missing round account skips the dispute (next scan re-derives). Pure function of chain state — no cursor, no replay: missed WS events are caught up by construction, restart-safe.
  - `startReconcileLoop(chain, juror, {intervalMs, signal, onResult, onError})` — boot scan before first resolve, then `setInterval`; scan failures surface via `onError` and the loop keeps ticking; `stop()` clears the timer (abortable via `AbortSignal`).
  - `JoinCandidate` / `DutySignal` exported here as the discovery vocabulary — the WS event subscriber (bean accord-vp5r) imports them rather than redefining.
- `apps/jurat/src/chain/reconcile.test.ts` — 10 tests (mocked accounts): all-subaccords→candidates; seated Commit duty with juror index; Review+Reveal actionable; not-seated no-duty; each non-actionable state (Created/Drawn/RoundResolved/RedrawEligible/Final/Closed/Failed) no-duty even when seated; missing round skipped; appeal round drives roundIdx; missed-event catch-up (Created boot scan → Commit later scan yields the duty; identical re-scan identical result); loop boot+interval+abort via fake timers and completion gates (no wall-clock sleeps); failed scan surfaced, loop survives.

Verification: `bun test` 27/27 green (join executor suite still green alongside), `tsc --noEmit` green.
