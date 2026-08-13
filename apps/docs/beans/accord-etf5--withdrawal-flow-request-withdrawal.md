---
# accord-etf5
title: Withdrawal flow (request_withdrawal)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T05:30:00Z
parent: accord-vet9
---

Submitter-only action on a Listed item → WithdrawPending. Show the withdrawal_timelock countdown (read-only). DoD: request_withdrawal executes; detail reflects WithdrawPending. see SPEC §Instructions #6, milestone §3 (no advance_withdrawal — cranker-owned).

## Summary of Changes

Implements the item withdrawal flow end-to-end in the new `apps/canon`
(@useaccord/canon-app) dApp. Because the scaffold (accord-9mut) and the rest of
the item-feature lane (accord-gg8f / m2u2) had not landed in this worktree
(all worktrees shared base ce2a668), a minimal Vite+React+Tailwind v4+
HashRouter+ConnectorKit shell was created to host the feature; the shell is
deliberately lean and clearly flagged for the scaffold/detail beans to absorb.

- `packages/canon/src/index.ts` — exported the generated standalone fetchers
  `fetchMaybeCanonItem` / `fetchMaybeCanonList` (mirrors @useaccord/sdk's
  `fetchMaybeSubaccord`), so read-only app hooks need no signer/client. SDK
  rebuilt; no IDL change.
- `apps/canon/src/features/item/withdrawal.ts` — pure logic: the eligibility
  predicate (submitter-only AND Listed; `canRequestWithdrawal`), the
  WithdrawPending check, and the countdown math (`withdrawalDeadline` /
  `withdrawalSecondsLeft`) over the Kit `Option<bigint>` timestamp. No RPC /
  React → unit-tested.
- `apps/canon/src/features/item/WithdrawalCard.tsx` — the core deliverable:
  `request_withdrawal` action (submitter-only, Listed→WithdrawPending) via the
  SDK facade + shared `sendInstruction` (pre-flight sim → confirm), and the
  read-only `withdrawal_timelock` countdown (live-ticking). `advance_withdrawal`
  is cranker-owned and NEVER appears as a button; elapsed window shows
  "withdrawable" (read-only).
- `apps/canon/src/features/item/{useCanonItem,useCanonList}.ts` — read hooks
  (TanStack Query + bare RPC) over the new SDK fetchers.
- `apps/canon/src/features/item/ItemDetailPage.tsx` — minimal `/items/:address`
  host: fetches CanonItem + backing CanonList, renders state/stake, mounts
  WithdrawalCard. Full state-machine detail is accord-gg8f's scope.
- `apps/canon/src/features/item/withdrawal.test.ts` — 11 unit tests (eligibility
  across all 5 states + null/wrong wallet, Option unwrap, deadline + seconds-left
  before/after expiry). All pass.
- Minimal app shell: configs (vite/ts/components.json), main/App/providers,
  index.css (design tokens), ui (button/sonner), lean navbar (inline wallet
  connectors + native cluster select), shared/ (rpc/transaction/wallet/errors/
  format/tokens/cluster) mirroring apps/app.

### Verification

- `pnpm --filter @useaccord/canon-app run lint` ✓ (tsc clean)
- `pnpm --filter @useaccord/canon-app run build` ✓ (vite build green)
- `pnpm --filter @useaccord/canon-app run test` ✓ (11/11 pass)
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* lint` ✓ (8/8)
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* build` ✓

### Out-of-scope finding (drafted, not fixed)

Workspace `pnpm -r ... test` is red due to a PRE-EXISTING @useaccord/sdk
test/dist conflict (packages/sdk is untouched by this bean): the sdk `test`
script runs `tsc -p tsconfig.json` (full emit) to produce the per-file `dist/`
its own tests import from (`../../dist/methods/*.js`), but that emit also
clobbers tsup's clean package-importable `dist/index.js` with extensionless ESM,
so canon's smoke test then fails to resolve `@useaccord/sdk`. Independent of
this change. Surfaced as draft bean accord-z05f for human review (needs a
sdk test/dist strategy decision, not a withdrawal-flow concern).
