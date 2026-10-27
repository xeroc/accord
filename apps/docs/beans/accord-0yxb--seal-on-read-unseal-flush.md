---
# accord-0yxb
title: Seal-on-read + unseal flush
status: completed
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T10:33:02Z
parent: accord-0xih
---

One predicate `sealVisible(ev, now)` used by ALL read paths (WS live send, WS replay, REST). Per sealed frame a timer at unsealAt re-fans-out to live subscribers. RED→GREEN per HANDOFF §6: verdict withheld on every path while now < unsealAt (fake timers), delivered + timer-flushed after. No path may bypass the predicate.

## Summary of Changes

- `apps/evidence-daemon/src/pipeline/seal.ts` — the shared seal seam (ADR-0037):
  - `isSealed(ev, now)` type guard (sole seal decision; narrows `unsealAt` for timer math), `sealVisible(ev, now)` predicate (the negation; the one every read path must apply), `filterVisible(frames, now)` order-preserving read-path filter.
  - `UnsealScheduler<T>`: `track(dispute, frame)` arms one timer per sealed frame at `unsealAt` (no-op for already-visible frames), fires the injected `fanout(dispute, frame)` exactly once on elapse; `pending()` count + `dispose()` teardown. Built on `Date.now()`/global timers so fake-timer tests drive it directly.
- `apps/evidence-daemon/src/pipeline/seal.test.ts` — RED→GREEN, 8 tests under `jest.useFakeTimers`: unsealed frames always visible; sealed withheld while `now < unsealAt`; inclusive visibility at `unsealAt`; filter preserves order; timer withholds 4999/5000ms then fans out once; already-visible frames never scheduled; per-dispute fanout isolation; `dispose` cancels.
- Consumers (accord-heqb WS watch, accord-f6hh REST, ingest fanout) import from `src/pipeline/seal.ts` — no read path hand-rolls its own seal check.
- Verified: `bun test` 356 pass / 0 fail, `tsc --noEmit` clean, `eslint .` clean (after `pnpm install` + sdk/synod builds in the fresh worktree).
