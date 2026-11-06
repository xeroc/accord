---
# accord-5j9y
title: Jurat — parallel duty advancement (bounded fan-out per scan)
status: completed
type: task
tags:
    - jurat
    - daemon
created_at: 2026-11-04T09:45:27Z
updated_at: 2026-11-04T09:45:27Z
---

## Scope

`handleScan` advanced duties strictly one-by-one: one dispute's slow LLM ladder (evidence fetch + two-phase agent + backoff retries, easily minutes) ate every sibling duty's commit/reveal window. Starvation hazard, not just throughput.

## Design decisions

- **Bounded fan-out inside the scan, not detached duty work.** `handleScan` awaits a FIFO worker pool (`runBounded`, `maxParallelDuties` seam, default 4) over the scan's duty signals. The daemon's single-flight `guarded()` loop stays the no-re-entry invariant — a scan still ends only when all its duty work lands, so no per-duty in-flight map is needed.
- **Joins stay sequential before the fan-out** — budget accounting (`stakedByToken` accumulation, join-book read-modify-write) is order-dependent by design.
- **Store saves serialize through a per-store promise tail** (`state/stores.ts`): the whole-file load→mutify→rewrite was last-writer-wins; two concurrent duty saves lost the slower record.
- **Knob: `JURAT_MAX_PARALLEL_DUTIES`** (default 4, ≥1 enforced — 0 throws). Bounds provider 429 / evidence-daemon burst; 1 restores sequential advancement.
- Per-duty failure isolation unchanged: the per-item catch (log + retry next scan) moved from the sequential loop into the pool's op wrapper.

## Acceptance criteria (TDD, all green in `bun test`)

- `scan advances duties in parallel: B reaches its verdict while A's is parked` — RED under the sequential loop, GREEN under the pool. Midpoint assertion reads verdict ENTRY (microtask-pure path) because the commit path hashes via `crypto.subtle` (threadpool macrotask no fixed drain boundary can order against).
- `maxParallelDuties: 1 keeps duties sequential (the LLM burst knob)`.
- `concurrent saves of distinct records both survive (no lost update)` — lost-update repro against the file stores.
- `maxParallelDuties: default 4, override parsed, 0 rejected` (config).
- Full package suite (253 tests) + `tsc --noEmit` + eslint green.

## REWRITTEN SCOPE (2026-11-04 — supersedes "bounded fan-out per scan" above)

First cut bounded duties INSIDE the scan (`runBounded` worker pool, scan awaited all duties). Still wrong: one minutes-long adjudication kept the scan open, and the daemon's single-flight guard then blocked every later scan — newly arriving adjudications piled up behind it.

- Duties now DETACH: `handleScan` submits signals to a cross-scan `DutyScheduler` (`makeDutyScheduler(limit)`) and settles immediately.
- Semaphore with synchronous slot transfer: a finished duty hands its slot to the next queued duty from ANY scan (FIFO). No over-admission window (check + increment are one sync block).
- Re-entry guard: keys `dispute:roundIdx` tracked from submit to completion; later scans skip in-flight duties (no double verdict / second salt). Redraw mid-flight = on-chain gate rejects, next scan recovers.
- `runDaemon.stop()` drains the scheduler.
- Test determinism notes: `handleJoins` does real file IO (`loadBook`) — one event-loop boundary cannot order against disk, so tests await the (now cheap) scan promise instead; midpoint assertions read verdict ENTRY (commit path hashes via `crypto.subtle`, a threadpool macrotask).
