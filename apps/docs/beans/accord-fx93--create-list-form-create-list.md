---
# accord-fx93
title: Create list form (create_list)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T03:55:00Z
parent: accord-pzhs
---

Form: stake_mint, fee_mint, list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock → createList instruction. DoD: creates a CanonList + backing Subaccord on Surfpool/devnet. see SPEC §Instructions #1.

## Summary of Changes

Implemented the `create_list` form page at `/lists/new` in `apps/canon`.

### CreateListPage (`src/features/list/CreateListPage.tsx`)

- Controlled form mirroring `apps/app`'s SubaccordCreatePage pattern: plain
  string state, parse-on-submit, no zod/react-hook-form.
- Fields: stake_mint, fee_mint (addresses), rules_hash (64-hex), list_program
  (optional, empty → System Program = ownership check disabled), submit_deposit
  (default 500), challenge_pct (bps, default 5000 = 50%, max 10000), listing_window
  (default 5d), withdrawal_timelock (default 5d). All defaults mirror
  `programs/canon/constants.rs`.
- Submit: calls `createList()` from `@useaccord/canon` → `sendInstruction()` →
  navigates to `/lists/:address` on success; inline error on failure.
- Connect-wallet gate when no signer is connected.
- Field primitive + hex32/bigint/bounded-int/address parsers (mirrors
  SubaccordCreatePage helpers).

### Supporting changes

- Copied `shared/transaction.ts` (sendInstruction), `shared/errors.ts`
  (describeError), `shared/wallet.ts` (useSigner/ZERO_ADDRESS) from apps/app.
- `App.tsx`: added `/lists/new` route.
- `ListBrowser.tsx`: added "Create a list." CTA in page header + empty state.

### Verification

- `apps/canon` lint (tsc --noEmit): clean.
- `apps/canon` build (tsc + vite build): green.
- Workspace-wide lint: all 4 apps clean.
- `createList` facade confirmed in `@useaccord/canon` SDK (sibling task
  accord-n6zg scope — facade shipped in commit 58c0580).
