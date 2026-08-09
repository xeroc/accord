---
# accord-bpag
title: Reconciler loop — 60s poll, getProgramAccounts, dispatch
status: todo
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
