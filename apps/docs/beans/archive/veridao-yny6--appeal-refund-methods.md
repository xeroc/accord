---
# veridao-yny6
title: Appeal & refund methods
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/appeal.ts: appeal (permissionless; 2N+1 panel scaling), claim_appeal_refund (idempotent, per round_idx). Acceptance: appeal Ix builds for each round; claim_appeal_refund derives the round refund PDA. See ADR-0004 + ADR-0010.

## Summary of Changes

Implemented `packages/sdk/src/methods/appeal.ts` — dispute appeal + bond refund (ADR-0004), the last of the eight method groups. Wired through the package entrypoint — the `Accord` facade now exposes all eight method modules.

**Client-side appeal-ladder math (mirror of on-chain, testable):**

- `panelSizeForRound(J, k)` = `min((J+1)·2^k − 1, MAX_JURORS)` — direct port of `panel_size_for_round` (lib.rs:1563).
- `appealCost(J, currentRound, feePerJuror)` → `{newRound, panel, fee, bond, total}` mirroring lib.rs:1416-1430 (`fee_new = panel · fee_per_juror`, `bond = fee_new`, `total = fee_new + bond`).
- `canAppeal(currentRound, maxAppeals)` (lib.rs:1386 gate).

**Instructions (ADR-0010 seam):** `appeal` (opens `current_round+1` with a `2N+1` panel, appellant pays fee+bond; lib.rs:1374), `claimAppealRefund(roundIdx)` (idempotent bond refund; lib.rs:1481), `findAppealBondPda` (`["bond", dispute, round_idx.le_u4]`, state.rs:2286). Kit type-only; PDA lazy.

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/appeal.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → **43/43** (5 appeal + 7 staking + 5 vrf + 7 snapshot + 7 lifecycle + 7 voting + 5 dispute). Appeal tests pin: the appeal ladder for J=3/5 (round 0→3/5, 1→7/11, 2→15/23, 3→31, capped at MAX_JURORS=31); cost math (fee/bond/total); `canAppeal` gate; AppealBond seeds; constants.

**Dependency note.** Standalone seam per ADR-0010 — compiles + ladder/cost logic verifiable today. Concrete client adapter + Surfpool e2e land with the foundation epic + jest suite (veridao-7iiv). With this, all eight facade method modules (dispute, voting, snapshot, lifecycle, vrf, staking, appeal) are implemented; the `Accord` class wiring is the Foundation task (veridao-iw8e).
