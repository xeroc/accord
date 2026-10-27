---
# accord-ewj8
title: Dispute detail view (state machine + timeline + ruling)
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-08T00:47:52Z
parent: accord-sdtj
---

Fetch dispute by address + current round. Display: subaccord, filer, state machine (Created → Drawn → Review → Commit → Reveal → RoundResolved → Final → Closed), option hashes (hex in Plex Mono), frozen VRF status, fee paid, appeal bond info. If state=Final: show finalRuling verdict (amber highlight on winning option). If state=RoundResolved + within appeal window: show appeal button. Embed commit/reveal voting UI (juror task accord-7mkb) when juror is drawn.

## Summary of Changes

### SDK: exported generated typed fetchers

- `packages/sdk/src/index.ts` — now exports `fetchMaybeDispute`, `fetchMaybeRound`,
  `fetchMaybeAppealBond`, `fetchMaybeJurorStake`, `fetchMaybeSubaccord`,
  `fetchMaybePauseState`, `fetchMaybePendingUpdate` from generated code. These
  work directly with raw Kit RPC (`createSolanaRpc()`) and return typed
  `MaybeAccount<T>`. Also exports the account data types (`Dispute`, `Round`,
  `AppealBond`, `Subaccord`) for consumer use.

### Dispute detail view

- `apps/app/src/features/dispute/useDispute.ts` — three TanStack Query hooks:
  - `useDispute(address)` — fetches a single dispute by address
  - `useRound(dispute)` — derives round PDA via `findRoundPda` and fetches it
  - `useAppealBond(dispute)` — derives appeal bond PDA and fetches it
- `apps/app/src/features/dispute/StateMachine.tsx` — visual state stepper:
  Created → Drawn → Review → Commit → Reveal → Resolved → Final → Closed.
  Past states are struck through, current is highlighted (green/amber), future
  are dimmed. Failed/RedrawEligible have special handling.
- `apps/app/src/features/dispute/DisputeDetail.tsx` — full detail view:
  - Back-link to dispute list
  - State machine visualization
  - Info grid: filer, subaccord (link), state, current round, fee paid, VRF
    status, frozen root, filed-at timestamp
  - Option hashes displayed as hex in Plex Mono, with amber highlight + "Verdict"
    label on the winning option when state=Final
  - Final ruling banner (amber) when finalized, with finalization timestamp
  - Round info card: juror count, commits, reveals, window timestamps, drawn jurors
  - Appeal bond card (conditional on bond existence): appellant, amount, prior result
  - Appeal action section when state=RoundResolved: disabled appeal button
    (wallet connection is ConnectorKit — not yet wired, placeholder)
  - Voting placeholder (commit/reveal UI is task accord-7mkb)
- `apps/app/src/App.tsx` — added `/disputes/:address` route → `DisputeDetail`

### Verification

- `pnpm --filter @useaccord/sdk run lint + build` — green
- `pnpm --filter @useaccord/app run lint` — green
- `pnpm --filter @useaccord/app run build` — green (253 kB bundle)
