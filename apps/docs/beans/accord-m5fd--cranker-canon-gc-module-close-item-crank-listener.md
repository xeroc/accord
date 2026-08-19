---
# accord-m5fd
title: Cranker — canon GC module (close-item crank, listener + GPA sweep, dedup)
status: completed
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-19T19:55:00Z
parent: accord-07n5
blocked_by:
  - accord-q8ns
---

---

assigned: implementer
---

Canon GC module in `apps/cranker`. Two triggers, one deduped dispatch (milestone accord-clfq HANDOFF §1 step 4 / §4 pseudo-code):

1. event-driven: subscribe CanonItem account notifications (pattern: `listener.ts` WS + memcmp) — items landing in `Removed` (post `ItemSettled`/`Withdrawn`) dispatch immediately;
2. reconciler 60s poll: `getProgramAccounts` on the canon program with discriminator + `state == Removed` memcmp → dispatch `close_item` for each (catches anything the listener missed, including pre-existing delisted items).
   Shared: `cranks/close-item.ts` (build + send `closeItem` via `@useaccord/canon`), dedup via the existing dispatch/state store, profitability guard (skip when account lamports ≤ tx fee + margin). Prefer parameterizing `ProgramAccountListener` over a canon-specific copy if the diff is smaller — implementer's call, state the choice in the bean body.

Design decisions (implementer)
------------------------------

- **Parameterized `ProgramAccountListener`** (chosen over a canon-specific copy): it already took `programId`; it only needed two more seams — injectable `filters` (default = the Accord Dispute discriminator filter, unchanged) and a generic `ListenerTarget` (`onAccount` / `onResubscribe`, renaming the dispute-shaped `ReconcilerTarget`). The diff touched listener.ts + its existing wiring/test, no second reconnect/backoff loop to maintain.
- **Dedup lives in `createCrankDispatch.execute`** as an in-flight `kind:subject` key set: the canon listener and the reconciler sweep converge on one dispatch per item, keys release on completion so failed cranks retry on the next trigger, and every other crank keeps sequential semantics (they're awaited).
- **Profitability guard in the executor** (`MIN_CLOSE_PROFIT_LAMPORTS = 10_000n`, fee + margin): the decoded `Account<CanonItem>` already carries `lamports`, so one choke point covers both trigger paths with zero extra roundtrips. Unprofitable → deliberate skip, logged.
- **`close-item.ts` skips (not throws) on a missing account** — post-close duplicate notifications and GPA staleness are expected, unlike the other canon cranks where a missing account is an anomaly.
- **Canon listener `onAccount` drives a scoped `reconcileOnce`** (canon-GC fetcher = `[item]`, all other fetchers emptied) instead of hand-building a second `CrankContext` — reuses the phase machinery and the dedup for free.
- **Config**: `CANON_GC_ENABLED` (default on) toggles listener + reconciler phase together; `CANON_PROGRAM_ID` overrides the SDK default for the scan, the listener subscription, and the `close_item` instruction (threaded as optional `CrankContext.canonProgramId`).

Acceptance criteria
-------------------

- [x] close-item crank + canon wiring in reconciler/listener/dispatch (canon program id configurable, module toggleable)
- [x] GPA memcmp filter correct (CanonItem discriminator + ItemState::Removed offset)
- [x] listener + reconcile converge on one dispatch per item (dedup, in-flight aware)
- [x] unit tests with fixture `Removed` items: dispatch-once, skip-unprofitable, both trigger paths
- [x] cranker lint + tests green; no regression in accord cranking

Summary of Changes
------------------

- `apps/cranker/src/canon-gc.ts` (new): `CANON_ITEM_STATE_OFFSET` (104, pinned by test against the generated encoder), `removedCanonItemFilters()` (discriminator + `state == Removed` memcmp), `findRemovedCanonItemAddresses()` (GPA + zero-length dataSlice, addresses only).
- `apps/cranker/src/cranks/canon/close-item.ts` (new): `canon_close_item` executor — fetch-maybe (missing ⇒ skip), `Removed`-state guard, profitability guard, builds `closeItem` via `@useaccord/canon` with optional program-id override; registered in `fullDispatch`.
- `apps/cranker/src/dispatch.ts`: in-flight `kind:subject` dedup in `execute` (listener + poll convergence).
- `apps/cranker/src/reconciler.ts`: Phase 5b canon-GC sweep (`fetchRemovedCanonItems` injectable, `canonCloseEnabled` toggle, `canonProgramId` default `CANON_PROGRAM_ID`), `canonProgramId` on both `CrankContext`s.
- `apps/cranker/src/listener.ts`: `ProgramAccountListener` parameterized — `filters` option + generic `ListenerTarget` (`onAccount`/`onResubscribe`); default behavior unchanged.
- `apps/cranker/src/index.ts`: registers the close-item crank, env wiring (`CANON_GC_ENABLED`, `CANON_PROGRAM_ID`), second listener instance for the canon program with the Removed filters; `.env.example` documents both vars.
- Tests: `canon-gc.test.ts` (layout pin + filter bytes + GPA query shape), `cranks/canon/close-item.test.ts` (happy close, all four live states skip, unprofitable skip, already-closed skip, program-id override), `dispatch.test.ts` (concurrent-duplicate dedup + retry-after-completion), `reconciler.test.ts` (Removed sweep dispatch + disabled-module no-scan), `tests/listener.test.ts` (filter forwarding, canon filters, default dispute filter).
- Verification: `pnpm --filter @useaccord/cranker test` — 99 pass / 0 fail; `lint` (eslint) clean; `build` (tsc --noEmit) clean; `pnpm run -r --filter "./apps/*" build` green.
