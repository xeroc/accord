---
"@useaccord/jurat": patch
---

Jurat advances duties through a cross-scan duty scheduler (default 4, `JURAT_MAX_PARALLEL_DUTIES`; 1 restores fully sequential advancement). A scan now *submits* its duty signals and settles immediately — previously `handleScan` awaited every duty, so one dispute's minutes-long LLM ladder held the whole truth loop hostage and delayed later scans' new duties (starvation hazard, not just throughput). The scheduler's semaphore hands a finished duty's slot to the next queued duty from ANY scan (FIFO refill); duties already queued or running are skipped by later scans (keyed `dispute:roundIdx` — no double verdict, no second salt); `stop()` drains the scheduler before exit. Joins stay sequential (budget accounting is order-dependent by design), and file-store saves chain through a per-store tail so concurrent duty saves cannot lose records (whole-file read-modify-write was last-writer-wins).
