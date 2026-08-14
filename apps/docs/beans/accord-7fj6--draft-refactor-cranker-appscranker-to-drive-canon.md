---
# accord-7fj6
title: Refactor cranker (apps/cranker) to drive Canon program cranks
status: completed
type: feature
priority: normal
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-14T21:50:00Z
---

Extend apps/cranker to drive Canon's permissionless cranks: advance_pending (Pending→Listed after listing_window), settle_item (read accord final_ruling, redistribute), advance_withdrawal (return stake after withdrawal_timelock). Scope, error handling, and multi-program dispatch to be defined when unblocked. The canon app deliberately does NOT crank (milestone §3).

## Summary of Changes

Scope defined and shipped: the cranker's existing reconciler/dispatch architecture
drives all three Canon cranks as new action kinds over the Canon account family;
the listener is untouched (60s poll is authoritative; canon windows are 5-day
timelocks, so WS latency buys nothing).

**Multi-program dispatch** (the bean's open question): the `CrankKind` union now
spans two programs; canon executors build via `@useaccord/canon` instruction
facades and sign with the new `CrankContext.signer` (the cranker wallet's
`TransactionSigner`; Accord cranks keep using the `accord.adapter` seam).
Discriminator-only payloads: canon actions carry just `{ item }`; executors
derive list, dispute, vault, and payee ATAs from on-chain state (`ataOf`).

**Error handling**: executors re-check item state (concurrent cranker →
deliberate skip, `{skipped}` logged), never re-check time — the on-chain handler
is the guard on the same monotonic unix clock; `sendIx`'s SimulationError model
(state moved → skip, no retry) covers races. `settle_item` fires only when the
item's Accord dispute is `Final` (read from the cycle's existing Dispute scan —
no extra fetch), because the on-chain handler reverts on non-Final.

### Files

- `packages/canon/src/queries.ts` (new) — `findAllCanonLists` /
  `findAllCanonItems`: discriminator-filtered decoded GPA scans over a bare RPC
  (mirrors `@useaccord/sdk` `queries.ts`); exported from the package index,
  documented in the README. The SDK stays the single source for fetchers.
- `apps/cranker/src/canon-state.ts` (new) — pure `resolveCanonAction(item,
  list, disputeFinal, now)` gating the three cranks exactly like the on-chain
  handlers.
- `apps/cranker/src/cranks/canon/advance-pending.ts` / `settle-item.ts` /
  `advance-withdrawal.ts` (new) — executors + `register` per crank, wired into
  `fullDispatch` (index.ts). Follow-up refactor: cranks split into
  `cranks/accord/` + `cranks/canon/`, kinds prefixed `canon_`, and the log
  sink's `dispute` field renamed `subject` — kind prefix, folder, and logs all
  name the program.
- `apps/cranker/src/reconciler.ts` — Phase 5 (Canon item scan; lists indexed
  once per cycle; dispute finality from the Phase-1 scan), injectable
  `fetchCanonItems`/`fetchCanonLists` for tests, `signer` on both CrankContext
  literals, and the `CrankDispatch` inline-import type fixed to a top-level
  `import type`.
- `apps/cranker/src/types.ts` — three new kinds/actions, `signer` on
  CrankContext.
- `apps/cranker/src/util.ts` — `fetchCanonItem`/`fetchCanonList` throw-if-missing
  wrappers over the generated bare-RPC fetchers.
- Tests: `canon-state.test.ts` (resolver gates incl. invariant-break + terminal
  states), reconciler phase tests (dispatch/skip/malformed-list coverage),
  dispatch completeness extended to 14 kinds.

### Verification

- `apps/cranker`: `bun test` 54/54 green; `tsc --noEmit` clean; eslint clean.
- Workspace CI set (`pnpm -r --filter ./packages/* --filter ./apps/*` lint /
  build / test): green, exit 0.
- The jest e2e lane cannot run in this worktree (module resolution of
  `@useaccord/sdk`/`@useaccord/canon` fails in jest — reproduced on clean
  develop via stash, pre-existing environmental issue, not this diff). The
  three crank instructions are e2e-covered by committed specs
  (`tests/src/canon.spec.ts` advance_pending + advance_withdrawal,
  `canon.challenge.spec.ts` settle) through the same SDK facades the executors
  call.

### Discovered (out of scope)

- Draft bean `accord-69pd`: `settle_item`'s challenger/submitter token accounts
  are `UncheckedAccount` with no on-chain key check (comment claims one) — a
  crank caller can redirect payouts until constrained.
