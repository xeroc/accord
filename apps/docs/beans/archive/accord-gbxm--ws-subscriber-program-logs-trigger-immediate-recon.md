---
# accord-gbxm
title: WS subscriber — program logs trigger immediate reconcile
status: completed
type: task
created_at: 2026-08-09T20:15:32Z
updated_at: 2026-08-09T20:15:32Z
parent: accord-z9nc
---

src/listener.ts:

1. Subscribe to program logs via WebSocket (ACCORD_WS_URL)
2. On any log from the Accord program: trigger immediate reconcile for affected disputes
3. Parse log to extract dispute address (best-effort — not authoritative)
4. Call reconciler.reconcileDispute(disputeAddress) immediately
5. On WS disconnect: log warning, fall back to 60s poll (reconciler is authoritative)
6. On reconnect: trigger full reconcile
   This is purely a latency optimization. The reconciler loop runs regardless.

## Summary of Changes

Implemented `apps/cranker/src/listener.ts` — the WebSocket latency-optimization
layer for the cranker reconciler (epic accord-z9nc, milestone accord-27r5).

**Deliverable — `ProgramLogListener`** (all 6 bean requirements met):

1. Subscribes to Accord program logs via `logsNotifications({ mentions: [programId] })`
   on a `rpcSubscriptions` client built from `ACCORD_WS_URL`.
2. On every program event, dispatches immediate reconciliation for affected disputes.
3. `extractDisputeCandidates(logs)` — best-effort, non-authoritative base58
   address extraction from log lines (de-dupes; ignores 88-char signatures).
4. Fires `reconciler.reconcileDispute(addr)` per candidate — fire-and-forget so a
   slow/failed reconcile never stalls the log stream.
5. On WS disconnect: logs a warning and reconnects with capped exponential backoff
   (1s→30s). The reconciler's 60s poll is authoritative and runs regardless — it is
   the documented fallback.
6. On every reconnect: triggers `reconciler.reconcileAll()` to close the gap.

**Decoupling:** declares a `ReconcilerTarget` interface (`reconcileDispute` +
`reconcileAll`) that the reconciler bean (accord-rev4) implements — listener
compiles standalone with no reconciler import.

**Scaffolding (minimal, required for the module to typecheck/lint):** added
`apps/cranker/` as a `@useaccord/cranker` workspace package — `package.json`,
`tsconfig.json` (extends base), `eslint.config.js`, `.prettierrc.json`,
`.env.example` (ACCORD_RPC_URL / ACCORD_WS_URL / ACCORD_CRANKER_KEYPAIR). This
overlaps the still-`todo` scaffold bean accord-7d4c; kept minimal so a later
landing of 7d4c merges cleanly.

**Verification (all green):**

- `apps/cranker` build (`tsc --noEmit`): clean
- `apps/cranker` lint (`eslint`): clean
- `apps/cranker` tests (`bun test`): 4 pass — parser + start/stop dispatch

Note: repo-wide `make lint` shows pre-existing `apps/app` errors
(`Cannot find module '@useaccord/sdk'` — the SDK `dist/` build artifact is absent
and untracked); unrelated to this change.
