---
# accord-ug63
title: Canon dApp — court-params form (essential/advanced) + list-detail court card
status: completed
type: feature
priority: normal
created_at: 2026-08-20T02:42:56Z
updated_at: 2026-08-20T03:15:26Z
---

Expose the create_list CourtParams (accord-qz7d / ADR canon/0002) in apps/canon: CreateListPage gets a Court section — essential fields (minStake, minJurySize, maxAppeals, feePerJuror) always visible; advanced ones (alphaBps, 5 windows→4 windows, revealThresholdBps, maxDrawAttempts, depth) behind a collapsed native <details>. ListDetailPage gets a Court card reading the backing Subaccord (params live there, per-list). Client-side guards mirror on-chain (alpha<=10000, nonzero windows, depth<=8 via new @useaccord/canon MAX_LIST_TREE_DEPTH export, odd jury, ladder<=MAX_JURORS, appealWindow floor) for fast feedback; program stays authority.

## Summary of Changes

- `packages/canon`: new `MAX_LIST_TREE_DEPTH = 8` export (methods.ts + index.ts, mirrors the program constant) — single source for the form's depth bound.
- `apps/canon` create form (`createForm.ts`): `FormState.court: CourtFormState` (one string field per `CourtParams` key), `DEFAULT_COURT` derived from `defaultCourtParams()`, and `buildCourt()` parsing with client-side guards mirroring on-chain (alpha ≤ 10k, nonzero review/commit/reveal, appeal ≥ 1h floor, odd jury, ladder (J+1)·2^k−1 ≤ MAX_JURORS, depth ≤ 8, revealThreshold ≤ 10k, drawAttempts 1–10). Program remains authority.
- `CreateListPage.tsx`: new Court fieldset — ESSENTIAL inline (minStake, minJurySize irreversible, maxAppeals, feePerJuror) + ADVANCED collapsed behind native `<details>` (alphaBps, 4 windows, revealThresholdBps, maxDrawAttempts, depth irreversible). Submit passes `court: buildCourt(form)` (was `defaultCourtParams()`). Inputs via the ui-kit Field/FieldLabel/FieldControl/Input primitives.
- `ListDetailPage.tsx`: new Court panel reading the backing Subaccord (`fetchSubaccordRaw` in `shared/rpc.ts`, same raw-decode pattern as `fetchCanonListRaw`) — three cards (economics / panel+escalation / windows), formatBps/formatWindow/formatTokenAmount, immutable fields tagged.
- Tests: 10 new node tests in `createForm.test.ts` (defaults parity, round-trip, every guard mirror). 74 pass total.
- Docs: canon SPEC out-of-scope entry + defaults note updated; canon README documents `MAX_LIST_TREE_DEPTH`.

Verification: apps/canon lint (tsc) green, 74/74 unit tests, vite build green, `pnpm -r run build` green workspace-wide. Browser/Surfpool visual check skipped (user call).
