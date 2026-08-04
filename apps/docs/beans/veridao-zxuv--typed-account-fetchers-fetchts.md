---
# veridao-zxuv
title: Typed account fetchers (fetch.ts)
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-04T21:52:57Z
parent: veridao-vxe9
blocked_by:
    - veridao-qlnn
---

Typed fetchers in `src/fetch.ts` over the generated account codecs: getSubaccord, getDispute, getSnapshot, getRound, getJurorStake, getPauseState (each nullable + throwing variant). Facade methods and tests depend on these. Acceptance: each account type in state.rs has a fetcher returning decoded + typed data. See ADR-0010.
