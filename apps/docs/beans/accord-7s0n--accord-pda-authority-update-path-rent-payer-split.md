---
# accord-7s0n
title: Accord — PDA-authority update path (rent-payer split + UpdatePayload extension)
status: todo
type: milestone
created_at: 2026-08-21T22:21:41Z
updated_at: 2026-08-21T22:21:41Z
---

Enable Arbitrable programs (PDA authorities) to CPI propose_subaccord_update, and extend UpdatePayload with the two court params Canon needs to retune.

## Scope (grilled 2026-08-22)

### 1. Rent-payer split in propose_subaccord_update

- Add required rent_payer: Signer to ProposeSubaccordUpdate (mirrors create_dispute). payer = rent_payer on the PendingUpdate init.
- Why: CanonList PDA (data-carrying account) is the pinned Subaccord authority; the system program rejects rent transfers from data accounts, so the CPI can never land today. Wallet authorities pass themselves.
- Breaking IDL change → make codegen → SDK facade → CLI → e2e → LiteSVM migrated in the SAME change (all callers in-tree).

### 2. Extend UpdatePayload (append at END — borsh variant-index stability)

- RevealThresholdBps(u16): validate <= 10_000; if aggregation == Median require > 0 (create_subaccord gate parity).
- MaxDrawAttempts(u8): validate >= 1.
- Arms in: state.rs enum, utils.rs validate_update_payload, execute_subaccord_update.rs match.

### 3. Accord dApp — authority-gated parameter update UI (added 2026-08-22)

- `apps/app/src/features/subaccord/SubaccordDetailPage.tsx`: when the connected wallet (`useSigner()` seam) === `subaccord.authority` (and != `Pubkey::default()` sentinel — wallet.ts already exports it), render an "Update parameters" action.
- Dialog flow: pick field + value (form fields reuse `SubaccordCreatePage.tsx` / `createForm.ts` inputs for domain validation) → `methods.proposeSubaccordUpdate` → read back `executeAfterSlot` via `fetchPendingUpdateExecuteAfter` → surface the 48h timelock countdown → "Execute update" button once `canExecuteAt` passes (execute is permissionless; shown to authority for UX).
- Pure helper `canUpdateSubaccord(subaccord, connected)` in the feature folder with colocated test — mirrors canon's `canRequestWithdrawal(item, connected)` gating precedent.
- App-local components on existing @useaccord/ui primitives; NO packages/ui additions expected (if one becomes shared later, Storybook rules kick in then).

### Blast radius

- programs/accord: propose_subaccord_update.rs, state.rs, utils.rs, execute_subaccord_update.rs
- NEW programs/accord/tests/update_litesvm.rs — the update path has ZERO LiteSVM coverage today (happy / wrong-authority / timelock-not-elapsed / reinit-nonce-collision / rent-payer-pays / new-variant validation / cross-field ladder re-check)
- make codegen → packages/sdk/src/generated; methods/lifecycle.ts + adapter.ts + lifecycle.test.ts
- apps/cli lifecycle/propose-update.ts (rent payer = loaded wallet; no new flag)
- tests/src/lifecycle.update.spec.ts migrate + extend
- programs/accord/accord.qedspec + formal_verification regen
- SPEC.md instruction table; ADR (amend 0005 or new accord/0028: PDA authorities + rent-payer split)
- .agents/skills/useaccord cross-check (flag table unchanged expected)
- apps/app SubaccordDetailPage: update-proposal UI (see §3) — gated on connected wallet === authority

## Acceptance

- make test green (unit + LiteSVM + e2e incl. migrated update spec)
- LiteSVM: PDA-style flow covered (rent_payer != authority succeeds, authority still signs)
- Docs reflect the new variants + rent_payer account
- dApp: authority wallet sees the update UI; non-authority wallets never do; propose → executeAfterSlot readback → execute round-trip verified in the browser against Surfnet
