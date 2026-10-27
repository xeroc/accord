---
# accord-hhyy
title: List detail page — params + item enumeration (state filter)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T04:20:00Z
parent: accord-pzhs
---

/lists/:address: render CanonList params; enumerate CanonItems via memcmp on `list` field (confirm offset — milestone §7); filter by state (Pending/Listed/Removed/Disputed). DoD: items render + filter works. see SPEC §Item state machine.

## Summary of Changes

Implemented the list detail page at `/lists/:address` in `apps/canon`.

### ListDetailPage (`src/features/list/ListDetailPage.tsx`)

- Fetches CanonList by address (`fetchCanonListRaw`) + CanonItems by list
  (`findAllCanonItemsByList` — new GPA helper). Both via TanStack Query.
- **Params panel**: renders mints, list_program, rules_hash, subaccord,
  authority, item_count, submit_deposit, challenge_pct, listing_window,
  withdrawal_timelock in a 3-column detail grid.
- **Item enumeration**: `findAllCanonItemsByList` filters by CanonItem
  discriminator + memcmp on `list` at **byte 40** (8 disc + 32 account —
  confirms milestone §7 open question). Items rendered as cards (account,
  state, stake, submitter, challenge_count), linking to `/items/:address`.
- **State filter**: client-side filter bar (All / Pending / Listed / Disputed /
  Withdraw / Removed) with live counts per state.
- Loading / not-found / error states.

### Supporting changes

- `shared/rpc.ts`: added `findAllCanonItemsByList(rpc, list)` GPA helper +
  `addressFilter` for the memcmp at offset 40. Imported `CANON_ITEM_DISCRIMINATOR`,
  `getCanonItemDecoder`, `CanonItem` type from `@useaccord/canon`.
- `shared/index.ts`: fixed barrel (was re-exporting format helpers from `./rpc`).
- `App.tsx`: wired `/lists/:address` route.

### Verification

- `apps/canon` lint (tsc --noEmit): clean.
- `apps/canon` build (tsc + vite build): green.
- Workspace-wide lint: all 4 apps clean.
