---
# accord-spxg
title: Create dispute form
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-08T01:05:40Z
parent: accord-sdtj
---

Controlled form at /disputes/new. Subaccord selector (address input or query param). On select: read subaccord feePerJuror, compute requiredFee = INITIAL_NUM_JURORS * feePerJuror. Option hashes: dynamic list of 32-byte hex inputs (2..=MAX_OPTIONS). Nonce (auto-increment or manual). evidenceHash defaults to [0;32]. On submit: derive dispute PDA, build createDispute instruction, optionally bundle requestVrf in same tx. sendInstruction, redirect to /disputes/:address.

## Summary of Changes

### Create dispute form

- `apps/app/src/features/dispute/CreateDispute.tsx` — controlled form at `/disputes/new`:
  - **Subaccord selector**: address input (supports `?subaccord=` query param). On
    valid address, fetches subaccord via `fetchMaybeSubaccord` and displays
    `feePerJuror` + panel size.
  - **Fee computation**: uses SDK `requiredFee(feePerJuror)` = `INITIAL_NUM_JURORS *
feePerJuror`. Amber-bordered callout shows the total.
  - **Option hashes**: dynamic list of 64-hex-char inputs (2..=MAX_OPTIONS=32).
    Add/remove buttons. Per-input validation: red border on invalid, green on valid.
    Live count display (valid/total).
  - **Nonce**: auto-generated random u32 with "Randomize" button + manual override.
  - **Evidence hash**: defaults to all-zeros (64 hex chars), editable with validation.
  - **Submit**: validates all inputs, computes fee. Disabled until form is valid.
    Shows error messages for missing/invalid inputs.
  - **Note**: actual instruction build + send requires ConnectorKit signer (accord-y5av).
    SDK `createDispute(client, accounts, args)` is the target API.

- `apps/app/src/features/dispute/useSubaccord.ts` — TanStack Query hook wrapping
  `fetchMaybeSubaccord` for the subaccord selector.

- `apps/app/src/App.tsx` — added `/disputes/new` route (before `/:address` to avoid
  route shadowing).

### Verification

- `pnpm --filter @useaccord/app run lint` — green
- `pnpm --filter @useaccord/app run build` — green (261 kB bundle)
