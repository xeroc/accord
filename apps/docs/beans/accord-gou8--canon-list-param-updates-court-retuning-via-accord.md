---
# accord-gou8
title: Canon — list param updates + court retuning via Accord CPI
status: completed
type: milestone
created_at: 2026-08-21T22:21:50Z
updated_at: 2026-08-21T22:21:50Z
blocked_by:
    - accord-7s0n
---

Ship the retuning path Canon's own docs anticipate: gated update instructions for list params and court params (CPI to Accord's propose_subaccord_update with the list PDA as invoke_signed authority).

## Scope (grilled 2026-08-22 — all decisions confirmed)

### Governance model

- Repurpose CanonList.authority (today: mirror of the list PDA, gates nothing): set to the CREATOR at create_list; rotatable via update_list itself. Zero layout change.
- Subaccord.authority stays the CanonList PDA forever (canon rejects UpdatePayload::Authority).

### Instruction 1: update_list (instant, authority-gated)

- Args: new submit_deposit, challenge_pct, listing_window, withdrawal_timelock (+ optional authority rotation).
- Guards: challenge_pct <= MAX_CHALLENGE_PCT_BPS, windows > 0, submit_deposit > 0.
- Instant — no timelock (deposits lock per-item at submit; challenge_pct applies at challenge; court params keep the 48h Accord timelock via CPI).

### Instruction 2: propose_court_update (CPI)

- CPIs Accord propose_subaccord_update: authority = list PDA via invoke_signed, rent_payer = caller (requires milestone accord-7s0n), caller-chosen nonce.
- Guards: REJECT UpdatePayload::Authority (rotating the Subaccord authority off the PDA permanently strands retuning); mirror create_list guards (alpha_bps <= 10_000, windows > 0). Everything else rides Accord validation.
- NO canon wrapper for execute — Accord's execute_subaccord_update is permissionless; cranker/CLI call it directly.

### Instruction 3 (UI, not program): Canon dApp — authority-gated retuning (added 2026-08-22)

- `apps/canon/src/features/list/ListDetailPage.tsx`: when the connected wallet (`useSigner()` seam, via `useCanon()`) === `list.authority`, render the retuning surface — two tabs or sections:
  - List params: form over submit_deposit / challenge_pct / listing_window / withdrawal_timelock (+ authority rotation) → `@useaccord/canon` `updateList` — instant, reflect immediately from the re-fetched `useCanonList`.
  - Court params: field+value picker reusing `CreateListPage.tsx` / `createForm.ts` court inputs → `proposeCourtUpdate` → read back `executeAfterSlot` from the PendingUpdate (SDK `fetchPendingUpdateExecuteAfter`) → 48h countdown → "Execute" button once elapsed (calls Accord's permissionless execute directly — no canon wrapper).
  - Court UI hides/locks immutable fields (min_jury_size, depth) and the rejected Authority variant.
- Pure helper `canUpdateList(list, connected)` with colocated test — mirrors the `canRequestWithdrawal` precedent.
- App-local components on existing @useaccord/ui primitives; no packages/ui additions expected.

### Blast radius

- programs/canon: accounts structs in lib.rs (root convention!), instructions/update_list.rs + propose_court_update.rs, events (ListUpdated, CourtUpdateProposed), errors (Unauthorized, ForbiddenPayload)
- NEW programs/canon/tests/update_litesvm.rs (auth gate, Authority-variant rejection, CPI propose success, list-param guards)
- canon codama codegen → packages/canon facade: updateList, proposeCourtUpdate
- apps/cli: canon/update.ts + canon/court-update.ts (flat naming per existing canon cmds) + .agents/skills/useaccord docs
- NEW tests/src/canon.update.spec.ts: update_list instant effect; propose_court_update → slot warp → direct Accord execute → Subaccord fields mutated; Authority variant rejected
- Canon SPEC.md: instruction table, authority model section; the 'retunable except min_jury_size/depth' claim becomes TRUE after accord-7s0n
- ADR canon/0003 (retuning + governance key)
- apps/canon ListDetailPage: authority-gated retuning UI (see Instruction 3) — list params instant, court params via propose → timelock → execute
- Canon SPEC 'Out of scope' line "post-creation retuning UI remains future" is superseded — UI ships here; update the SPEC section in this milestone

## Acceptance

- make test green; canon.update.spec green on Surfpool end-to-end (CPI propose + timelock + execute)
- Docs + skill reference match shipped commands
- dApp: authority wallet sees retuning UI on the list detail page; non-authority wallets never do; update_list instant round-trip + court propose → execute round-trip verified in the browser against Surfnet

## Summary of Changes

- **Authority model (zero layout change):** `CanonList.authority` = the creator at `create_list`, rotatable via `update_list` (`Pubkey::default()` sentinel = keep). Subaccord authority stays the CanonList PDA forever.
- **Program** (`programs/canon`): new `update_list` (instant, guards ZeroDeposit/ChallengePctTooHigh/WindowTooShort/Unauthorized) + `propose_court_update` (CPI `propose_subaccord_update`: list PDA signs via invoke_signed, caller = rent payer per ADR-0028; rejects `UpdatePayload::Authority` with ForbiddenPayload; mirrors AlphaTooHigh/WindowTooShort). New errors `Unauthorized`/`ForbiddenPayload`/`ZeroDeposit`, events `ListUpdated`/`CourtUpdateProposed`. Accounts structs at crate root per convention.
- **Tests:** NEW `programs/canon/tests/update_litesvm.rs` (14 tests: auth gates, rotation, guard matrix, CPI propose with proposed_by == list PDA, Authority rejection, RevealThresholdBps pass-through). NEW `tests/src/canon.update.spec.ts` (4 tests green on Surfpool: instant update, non-authority revert, propose → slot warp → direct Accord execute → Subaccord mutated, Authority variant rejected + no account). Fixed stale `create_list_litesvm` authority assertion.
- **SDK:** canon codegen regenerated (updateList/proposeCourtUpdate instructions + UpdatePayload type); `packages/canon` facade `updateList`/`proposeCourtUpdate` (derives PendingUpdate PDA via @useaccord/sdk).
- **CLI:** `canon:update` (omitted flags keep on-chain values) + `canon:court-update` (Kind:value payload, client-side Authority rejection, emits executeAfterSlot); skill docs updated (references/11-canon.md + SKILL.md routing).
- **dApp:** `RetunePanel` on ListDetailPage gated by `canUpdateList(list, connected)` (pure helper + 9 colocated tests in `retune.test.ts`); list params form (instant) + court field picker (11 fields — never Authority/min_jury_size/depth) → propose → executeAfterSlot readback → Execute (direct Accord execute). Readback decodes via page RPC + `getPendingUpdateDecoder` (workspace-sourced SDK runs a second kit instance whose Codama client rejects the page's RPC proxy — noted in-code).
- **Docs:** SPEC.md (instruction rows 9/10, authority model, superseded out-of-scope line, status→built), ADR `canon/0003` + index. Browser-verified against Surfnet: authority wallet sees the panel, update_list round-trip landed on-chain (deposit 500→777), court propose landed (PendingUpdate on-chain) + executed (alphaBps 1000→1500); the Execute button's own click-through is gated by `getSlot`, which reads Surfpool's internal clock and cannot observe the sysvar warp (harness limitation — the send path is the same code as the verified update_list send).
