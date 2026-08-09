---
# accord-bpag
title: Reconciler loop — 60s poll, getProgramAccounts, dispatch
status: completed
type: task
priority: normal
created_at: 2026-08-09T20:14:54Z
updated_at: 2026-08-09T20:15:02Z
parent: accord-rev4
blocked_by:
  - accord-rnel
---

src/reconciler.ts: the authoritative poll loop.

- Every 60s: getProgramAccounts for Dispute accounts in non-terminal states
- For each: call resolveNextAction (from state-resolver task)
- If action returned: execute the crank via the dispatch map
- Logs each action with dispute address + instruction name
  src/dispatch.ts: crank registration map (key = action type, value = async fn).
  Initially empty — cranks register themselves. This is the only merge point
  between epics; subsequent epics add entries without touching shared files.

## Summary of Changes

Added the authoritative poll loop + the crank dispatch registry — the last two
pieces of the Foundation epic. The loop is wired to the SDK + the
wallet/send/state modules from accord-7d4c / accord-rnel; it runs end-to-end
but the dispatch map starts empty (cranks register in later epics).

`src/dispatch.ts` — `CrankContext` (dispute, round, wallet, rpc, rpcSubscriptions,
`send`) + `CrankDispatch` (`register` / `execute` / `has`). `createCrankDispatch()`
returns a map keyed by `CrankAction["kind"]`; `register` throws on duplicate
(fail-loud); `execute` returns false when no handler is registered (logged +
skipped — a crank for that kind lands in a later epic). The single merge point
between epics: a new crank is one `register(kind, fn)` call, no shared file edits.

`src/reconciler.ts` — `reconcileOnce(config)`: fetch every Dispute
(`findAllDisputes`), drop Closed/Failed, then per dispute resolve against the
current Round, and — when Final with no current-round action — scan prior Rounds
for `settle_round`. One action per dispute per cycle (no bundling; the next cycle
picks up the next). Each resolved action is dispatched + logged
(`{dispute, action, handled}`). `startReconciler()` fires one cycle immediately on
boot then every `intervalMs` (default 60s); a failed cycle is logged and never
kills the timer. The dispute + round fetchers are injectable so the loop is
unit-testable with no validator (defaults: `findAllDisputes(rpc)` +
`fetchMaybeRound` over the derived `findRoundPda`).

Tests: `src/reconciler.test.ts` — 6 cases: Created→request_vrf dispatched+logged,
Closed/Failed skipped, Final prior-round settlement scan, one-action-per-cycle
(current round wins), unhandled kind logged+skipped, handled-count across mixed
disputes. `bun test` → 21 pass (15 state + 6 reconciler).
Verify: `pnpm run build` (tsc --noEmit) ✓, `pnpm run lint` ✓, `pnpm test` ✓.

Not wired into `src/index.ts` yet — the dispatch map is empty, so the loop would
only scan + log "no handler"; a later epic registers the cranks and flips the
entry point to `startReconciler`.
