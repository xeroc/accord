---
# accord-3rk5
title: New-case form — subaccord browser + validated paste + open_case
status: completed
type: task
created_at: 2026-08-18T19:13:34Z
updated_at: 2026-08-18T19:13:34Z
parent: accord-5fe9
---

Plurality-filtered Subaccord browser (cards show frozen-fee preview initial_num_jurors·fee_per_juror + fee_token) + paste-address field with inline fetch validation (rejects Median). Parties 2–7 distinct pubkeys (opener auto-slotted at index 0), stake S with N·S>fee preview, join deadline. Calls SDK openCase.

## Summary of Changes

- `features/case/NewCasePage.tsx` (`/cases/new`, route wired in App.tsx): Plurality-filtered Subaccord browser over `findAllSubaccords` (cards show `minJurySize` · `feePerJuror` + fee token; selected card shows the frozen fee), paste-address field with 400 ms-debounced `fetchSubaccordMaybe` validation (invalid / not-found / Median rejected → error, Plurality → selected), 2–7 distinct-party roster with the connected wallet auto-slotted as opener (party 1), stake S + join-window inputs, live pot `N·S` vs frozen-fee preview gating submit on `N·S > fee`, `openCase` from `@useaccord/synod` sent via the shared `sendInstruction`; success → toast with the case PDA (detail/home routes land with accord-o6nn/accord-hvf9).
- `features/case/newCaseForm.ts` — pure client-side gates mirroring on-chain `open_case` (roster bounds/distinctness, fee preview math, Plurality gate, deadline), TDD'd by `newCaseForm.test.ts` (RED→GREEN).
- Shared seams ported canon-shaped for this page (accord-utod extends): `shared/wallet.ts`, `shared/rpc.ts` (`useClusterRpc`), `shared/transaction.ts` (`sendInstruction`), `shared/errors.ts` (`describeError`), `shared/format.ts` (+tests).
- Fixed the `test` script glob to quote `"src/**/*.test.ts"` — POSIX sh doesn't globstar, nested feature tests were silently skipped (now 22/22).

Verify: app lint ✅ build ✅ tests 22/22 ✅; browser smoke on the built bundle — `/#/cases/new` mounts (heading + connect gate), `/#/` renders, zero page errors; workspace CI trio (build/lint/test) exit 0.
