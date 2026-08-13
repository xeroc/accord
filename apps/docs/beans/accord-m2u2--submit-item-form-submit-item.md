---
# accord-m2u2
title: Submit item form (submit_item)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T06:10:00Z
parent: accord-vet9
---

Form: account (validated owner == list.list_program client-side where feasible), evidence hash, deposit (default submit_deposit). → submitItem instruction. DoD: item → Pending on Surfpool/devnet. see SPEC §Instructions #2.

## Summary of Changes

Adds the Item Submitter form (milestone §1 path (b)) to `apps/canon`.

- `SubmitItemPage.tsx` (`/lists/:address/submit`) — fields for the curated
  account, 32-byte evidence hash (hex), and fee_mint deposit (defaults to the
  list's `submit_deposit`). On submit it derives the submitter + vault ATAs,
  builds `submitItem` via the `@useaccord/canon` facade, sends it (pre-flight
  sim → confirm), and navigates to the new item's detail page (Pending).
- Client-side owner validation (milestone §3): reactively resolves the
  account's owner via `getAccountInfo` and previews match against
  `list.list_program` (✓/✗), skipping the check when the list sets the
  sentinel (ownership disabled). The on-chain check remains authoritative;
  this is a preview only.
- Evidence hash parsed from hex (64 chars, optional 0x) → Uint8Array with
  inline validation; deposit editable (defaults to submit_deposit).
- `index.css` — added the form classes (`.form`/`.field`/`.label`/`.input`/
  `.help`/`.form-error` + `.check-ok`/`.check-bad`) used by the form.
- `App.tsx` — wired the `/lists/:address/submit` route.

### Verification

- `pnpm --filter @useaccord/canon-app run lint` ✓
- `pnpm --filter @useaccord/canon-app run build` ✓
- `pnpm --filter @useaccord/canon-app run test` ✓ (11/11)
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* lint` ✓
- Workspace `pnpm run -r --filter ./packages/* --filter ./apps/* build` ✓

Note: the full "item → Pending on Surfpool" DoD requires a live funded list +
wallet (Surfpool lane), exercised by the e2e suite — not reproduced in this
isolated worktree. The form builds + sends the `submitItem` instruction
correctly against the SDK facade (pre-flight sim surfaces reverts with logs).
Workspace `pnpm -r ... test` stays red on the pre-existing @useaccord/sdk
test/dist conflict (draft bean accord-z05f); apps/canon's own suite is green.
