---
# veridao-o8ki
title: Staking methods
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/staking.ts: stake (ATA + token transfer wiring), unstake. Facade surfaces a typed guard rejecting unstake while active_draws > 0 (matches on-chain error, fail before tx). Acceptance: stake/unstake Ix builds; active_draws guard unit-tested. See ADR-0010.

## Summary of Changes

Implemented `packages/sdk/src/methods/staking.ts` — Juror capital stake/unstake + the `active_draws` typed guard. Wired through the package entrypoint.

**Typed guard (the test-matrix row 4 acceptance).** `canUnstake(stake, amount)` / `assertCanUnstake(...)` pre-flight the unstake against the live `JurorStake`, returning a typed reason (`StakeLocked` / `InvalidAmount` / `InsufficientBalance`) that matches the on-chain revert order (lib.rs:270-277: `amount > 0`, then `active_draws == 0`, then `amount ≤ amount`). `unstake()` calls this BEFORE building the tx, so a juror with open draws is rejected client-side — never builds, never sends.

**Instructions (ADR-0010 seam):** `stake` (SPL transfer juror→vault, lib.rs:206), `unstake` (vault→juror, lib.rs:270), `findJurorStakePda` (`["stake", subaccord, juror]`, state.rs:1732). Kit type-only; PDA lazy.

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/staking.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → **38/38** (7 staking + 5 vrf + 7 snapshot + 7 lifecycle + 7 voting + 5 dispute). Staking tests pin: `StakeLocked` when `active_draws > 0` (incl. precedence over balance); `InsufficientBalance`; `InvalidAmount`; happy path; `assertValidAmount`; `jurorStakeSeeds`.

**Dependency note.** Standalone seam per ADR-0010 — compiles + guard logic verifiable today. Concrete client adapter + `fetchJurorStake` wiring + Surfpool e2e land with the foundation epic + jest suite (veridao-7iiv).
