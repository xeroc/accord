---
# veridao-j7tx
title: VRF & draw choreography
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/vrf.ts: the hardest orchestration. request_vrf -> await/poll commit_vrf_callback -> draw(draw_attempt, memberships). On SortitionMismatch/collision, increment draw_attempt and retry using the SAME committed VRF (never re-request). Compose with snapshot.ts memberships builder. Acceptance: full request->commit->draw flow runs; retry-on-collision unit-tested. See ADR-0010 §Business Logic + ADR-0009.

## Summary of Changes

Implemented `packages/sdk/src/methods/vrf.ts` — the VRF request → commit → draw choreography (ADR-0009 §2), composed with the snapshot MST builder. Wired through the package entrypoint.

**Client-side sortition (the deterministic core, lib.rs:895-930):**

- `vrfSeed(committedVrf, dispute, roundIdx, drawAttempt)` = `sha256(committed_vrf ‖ dispute ‖ round_le4 ‖ attempt_le4)`.
- `drawSlots(...)` = `r_i = u64_le(sha256(vrf_seed ‖ i_le4)[0..8]) % total_stake` for each panel slot.
- `isDistinctPanel` / `resolvePanel` — **the retry-on-collision logic**: loops `draw_attempt` from 0, derives slots, builds memberships via the snapshot MST, and returns the first attempt yielding a DISTINCT panel — reusing the SAME committed VRF (never re-requesting, per ADR-0009 §2). Pre-resolving locally means the submitted `draw` succeeds first try instead of reverting.

**Orchestration (ADR-0010 seam):** `requestVrf` (CPI into the magicblock oracle, lib.rs:793), `awaitCommittedVrf` (polls `committed_vrf` until the oracle callback lands), `draw` (builds the draw ix with pre-resolved `draw_attempt` + memberships + JurorStake remaining accounts, lib.rs:861).

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/vrf.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → **31/31** (5 vrf + 7 snapshot + 7 lifecycle + 7 voting + 5 dispute). VRF tests pin: `vrfSeed` determinism + attempt/round/dispute sensitivity; `drawSlots` range `[0, total_stake)` + attempt-variance; `resolvePanel` returns a distinct panel and is reproducible (same VRF across retries); `resolvePanel` throws `DrawCollision` when a distinct panel is impossible (pigeonhole: panel > real jurors).

**Mechanical note.** vrf.ts is the first method module with a cross-module runtime dep (it imports the snapshot MST builder). Node's direct type-stripper can't resolve `./snapshot.js`→`.ts`, so `vrf.test.ts` imports the compiled dist output and the `test` script builds first (`tsc && node --test`). The other method tests remain source-direct (self-contained).

**Dependency note.** Standalone seam per ADR-0010 — compiles + sortition/retry logic verifiable today. Concrete client adapter + oracle wiring + Surfpool e2e land with the foundation epic + jest suite (veridao-7iiv).
