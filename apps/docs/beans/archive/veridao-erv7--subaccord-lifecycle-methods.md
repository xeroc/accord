---
# veridao-erv7
title: Subaccord lifecycle methods
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-05T00:00:00Z
parent: veridao-gqzm
---

src/methods/lifecycle.ts: create_subaccord, propose_subaccord_update, execute_subaccord_update (timelock-aware: wait execute_after_slot), and the pause quartet (initialize_pause, pause, propose_unpause, execute_unpause). Args + accounts from lib.rs. Acceptance: each method builds + simulates its Ix; timelock flow surfaces execute_after_slot. See ADR-0010 §Business Logic.

## Summary of Changes

Implemented `packages/sdk/src/methods/lifecycle.ts` — Subaccord lifecycle (ADR-0005) + the circuit-breaker quartet (ADR-0007), seven instructions total. Wired through the package entrypoint.

**Instructions (ADR-0010 seam, same pattern as dispute/voting/snapshot):**

- `createSubaccord` — permissionless pool creation (13 args; lib.rs:146).
- `proposeSubaccordUpdate` / `executeSubaccordUpdate` — authority-gated propose + permissionless execute (lib.rs:331/372).
- `initializePause` / `pause` / `proposeUnpause` / `executeUnpause` — the ADR-0007 quartet (lib.rs:77-144).

**Timelock awareness (the client-side logic, ADR-0010 §4).** `propose_subaccord_update` writes `execute_after_slot = slot + UPDATE_TIMELOCK_SLOTS` on-chain; the SDK can't predict the exact landing slot, so the flow is: `proposeSubaccordUpdate` → `getUpdateExecuteAfterSlot` (reads `execute_after_slot` back from the PendingUpdate account) → `canExecuteAt(executeAfter, current)` → `executeSubaccordUpdate`. The same shape backs the unpause timelock. Constants `UPDATE_TIMELOCK_SLOTS` (432_000) and `UNPAUSE_TIMELOCK_SLOTS` (21_600) exported.

**Pure helpers (tested):** `subaccordSeeds` (`["subaccord", creator, domain_ref]`), `pendingUpdateSeeds` (`["update", subaccord, nonce.le]`), `pauseSeeds` (`["pause"]`), `assertValidMaxAppeals` (`≤ MAX_APPEALS`, lib.rs:168), `assertValidRiskType` (≠ zero, lib.rs:164), `canExecuteAt`. PDA derivations `findSubaccordPda` / `findPendingUpdatePda` / `findPausePda` (Kit lazy-imported). `UpdatePayload` mirrored as a TS discriminated union (state.rs:254-266).

**Verification.** `make lint` green; `pnpm --filter @veridao/sdk run build` emits `dist/methods/lifecycle.{js,d.ts}`; `pnpm --filter @veridao/sdk run test` → **26/26** (7 lifecycle + 7 snapshot + 7 voting + 5 dispute). Lifecycle tests pin: timelock constants vs constants.rs; all three PDA seed constructions (incl. nonce u64 LE + zero-risk rejection); max-appeals/domain-id validation; `canExecuteAt` gate.

**Dependency note.** Standalone seam per ADR-0010 — compiles + logic verifiable today. Concrete client adapter + `fetchPendingUpdateExecuteAfter` wiring + Surfpool e2e land with the foundation epic + jest suite (veridao-7iiv).
