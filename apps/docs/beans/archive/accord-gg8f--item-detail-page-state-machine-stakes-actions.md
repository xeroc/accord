---
# accord-gg8f
title: Item detail page — state machine + stakes + actions
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T05:50:00Z
parent: accord-vet9
---

/items/:address: render CanonItem (state, accumulated_stake, submitter, challenger, challenge_count, timestamps) as a state-machine view. Show submitter actions (request_withdrawal when Listed). Cranks are read-only status (not buttons). DoD: all 5 states render correctly; transitions legible. see SPEC §Item state machine, milestone §3.

## Summary of Changes

Expands `apps/canon` `/items/:address` into the full CanonItem state-machine
view (the prior accord-etf5 commit left a minimal host flagged for this bean).

- `ItemDetailPage.tsx` — rewritten as a state-machine view rendering all five
  states (Pending / Listed / Removed / WithdrawPending / Disputed): a
  colour-coded state badge, a per-state "what happens next" transition hint,
  and the full field set (account, list, submitter, challenger, challenge
  stake/count, accumulated stake, submitted/challenged/withdrawal-requested
  timestamps). Per-state status:
  - Pending: listing-window countdown (submittedAt + listingWindow) +
    read-only "advance_pending (cranker)" note.
  - Listed / WithdrawPending: mounts WithdrawalCard (submitter
    request_withdrawal action / read-only withdrawal countdown).
  - Removed: terminal note.
  - Disputed: inline DisputeStatusCard.
  Cranks (advance_pending / settle_item / advance_withdrawal) are read-only
  status, never buttons (milestone §3).
- `DisputeStatusCard.tsx` — inline, read-only Accord dispute status
  (milestone decision #7): decodes the backing Dispute PDA, shows state /
  round / ruling (canon-fixed [keep, remove] labels) / filed + finalized
  timestamps, and deep-links the Accord dApp (`VITE_ACCORD_APP_URL/#/disputes/:address`,
  new tab). settle_item is noted as cranker-owned.
- `useDispute.ts` — read hook over bare RPC via `@useaccord/sdk`
  `fetchMaybeDispute`; skips the zero-sentinel `activeDispute`.
- `shared/format.ts` — added `DISPUTE_STATE_LABELS`, `formatRuling` (255 =
  none), `formatTimestamp`; re-exported from `shared/index.ts`.

### Verification

- `pnpm --filter @useaccord/canon-app run lint` ✓
- `pnpm --filter @useaccord/canon-app run build` ✓
- `pnpm --filter @useaccord/canon-app run test` ✓ (11/11)
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* lint` ✓
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* build` ✓

Note: workspace `pnpm -r ... test` remains red on the pre-existing
@useaccord/sdk test/dist conflict (draft bean accord-z05f) — unrelated to this
change; apps/canon's own test suite is green.
