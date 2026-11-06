---
# accord-546d
title: 'Verdict latency batch: coalesced-dispatch chaining + time-gate wakes (cranker), SeatDrawn read-settle re-kicks (jurat)'
status: completed
type: task
created_at: 2026-11-06T09:58:14Z
updated_at: 2026-11-06T10:15:00Z
---

Devnet 2026-11-06 profile (dispute 54q6wQox, 209.9s attack->settle): draw_seat +38.5s (VrfCommitted dispatch coalesced into a failing duplicate request_vrf run, settled fired=0, 60s poll backstop), finalize_dispute +21s (appeal-window gate has no wake), jurat duty pickup +45s (kicked scan at +450ms read pre-draw state, next timer 120s). Full profile analysis in the session transcript; the settle-leg (+49s, inveigo cranker poll-only) is handed off as inveigo bean inveigo-413g.

## Scope

- [x] cranker `reconcileDispute`: coalesced triggers chain one fresh re-resolve instead of dying with a settling run (`pendingRerun` set, bounded by `opts.reruns`, default 3)
- [x] cranker `resolveNextAction`: `WaitGate` return (`{ kind: "wait", until }`) for voting-window and appeal-window gates; reconciler arms `scheduleWake` at gate-open (+1s wall-vs-chain skew epsilon)
- [x] cranker `makeWakeScheduler` (earlier-deadline-wins, dispose) wired in `index.ts` via a `wired` config shared by poll + both WS listeners; disposed on shutdown
- [x] jurat `makeHintHandlers`: our SeatDrawn schedules read-settle re-kicks (default +1.5s/+4s, injectable seams); redundant kicks are safe (daemon gate + tracked-duty dedupe)
- [x] changeset `.changeset/verdict-latency-batch.md`

## Acceptance (TDD)

- [x] RED→GREEN state.test: voting/appeal waits now pin `WaitGate` returns (was `null`)
- [x] NEW reconciler.test: trigger coalesced into a FAILING run chains a fresh fetch (the exact 2026-11-06 draw_seat stall)
- [x] NEW reconciler.test: WaitGate arms `scheduleWake` at `(revealEnd + appealWindow)·1000 + WAKE_EPSILON_MS`, fires nothing
- [x] NEW reconciler.test: `makeWakeScheduler` earlier-or-equal wins / later ignored / dispose clears
- [x] jurat runtime.test: our seat schedules re-kicks at [1500, 4000] and they kick; foreign seat schedules nothing; existing our-seat test pinned with `seatRetryDelaysMs: []`
- [x] cranker: build + lint + `bun test` 118/118; jurat: build + lint + `bun test` 258/258

## Summary of Changes

- `apps/cranker/src/state.ts` — `WaitGate` type; voting + RoundResolved branches return it instead of `null` (user-action waits still `null`); header docs updated
- `apps/cranker/src/reconciler.ts` — `pendingRerun` chaining in `reconcileDispute` (+2026-11-06 post-mortem in its doc comment), `scheduleWake` config seam, wake arming in `reconcileOnce`, `WAKE_EPSILON_MS`, `makeWakeScheduler` + named `WakeScheduler` contract
- `apps/cranker/src/index.ts` — `wired` config + wake scheduler shared across poll and both listeners; dispose on shutdown
- `apps/cranker/src/state.test.ts`, `reconciler.test.ts` — WaitGate pins + 3 new tests; coalesce test updated to the chained contract (fetches 2→3)
- `apps/jurat/src/runtime.ts` — `seatRetryDelaysMs`/`setTimeoutFn` seams on `HintHandlersDeps`; retries in `onSeatDrawn` (ours only); doc updated
- `apps/jurat/src/runtime.test.ts` — 2 new tests + `seatRetryDelaysMs: []` on the alert-path pin
- `.changeset/verdict-latency-batch.md` — patch for @useaccord/cranker + @useaccord/jurat

Devnet re-proof (expected: attack→settle ~210s → ~60s, LLM-bound) pending redeploy — not verifiable from this machine; the three scheduling legs are each pinned by a regression test.
