---
# accord-daq8
title: Synod product surface — dApp + cranker + evidence grouping
status: completed
type: milestone
priority: normal
created_at: 2026-08-18T19:12:55Z
updated_at: 2026-08-18T22:25:11Z
---

Ship the user-facing surface for Synod v1: the @useaccord/synod-app dApp (apps/synod), the cranker synod module, and the evidence-daemon pre-dispute grouping. Program + SDK are DONE (accord-oylq); this milestone is everything downstream. Grilling session 2026-08-18 resolved all decisions.

## HANDOFF

### 1. Happy Path

1. Creator opens `/cases/new`, picks a Plurality Subaccord (browser shows frozen-fee preview = `initial_num_jurors · fee_per_juror`), names 2–7 parties (opener = index 0), sets stake `S` + join deadline → `open_case`.
2. Named party opens the app home, sees the case under "Cases awaiting you", authors evidence in the structured editor, encrypts to the operator keyring → `POST /evidence/synod/:case/:slot` → `join` with the bundle hash (stake `S` moves party ATA → vault).
3. Full roster → cranker (or manual button) fires `file_dispute`: options = per-party + neutral at highest index, `evidence_root = H(case_pda ‖ h_0 ‖ … ‖ h_{N-1})`, frozen fee vault → fee_vault, dispute PDA `["dispute", case, 0]` bound.
4. Accord resolves the dispute (draw/commit/reveal/finalize — apps/app territory, deep-linked from case detail).
5. Cranker claim sweep (or manual claim button) pays: winner takes pot `N·S − fee`; neutral → per-party floor share, last claimant drains remainder; `Failed` → full `S`. Idempotent via `paid_out` bits.

### 2. Data Contract

- App: `apps/synod`, package `@useaccord/synod-app`. Consumes `@useaccord/synod` (`openCase`/`join`/`fileDispute`/`refundRosterMiss`/`claim`, `findCasePda`) + `@useaccord/sdk` evidence module. Canon-app-shaped: Vite + React + Tailwind v4 + shadcn + HashRouter, `features/` + `shared/` layout.
- Daemon routes (new, `/synod/` namespace): `POST /evidence/synod/:case/:party` (party = slot 0–6, unauthenticated — the join-committed hash IS the commit; 409 once the dispute is filed) and `GET /evidence/synod/:case` (assembled multi-bundle manifest, ADR-0017 party field, `verified` flag once filed).
- Cranker: `CrankKind` grows `synod_file_dispute | synod_refund_roster_miss | synod_claim`; `synod-state.ts` resolver mirrors `canon-state.ts`; executors in `src/cranks/synod/`.
- On-chain: `programs/synod` is authority and is DONE — this milestone changes no program code.

### 3. Edge Cases & Constraints

- NO CI deploy workflow for the app (owner decision): GH-Pages-style base path + HashRouter, manual deploy only.
- Daemon synod pushes unauthenticated by design: junk bundles simply fail the post-file root verification (PDA identifies, per-party hashes commit).
- Manifest GET post-file: recompute `H(case ‖ h_0…h_{N-1})` vs `Dispute.evidence_hashes[0]`; mismatch ⇒ `verified: false` and juror assembly refused.
- Cranker claim sweep skips parties whose `fee_token` ATA doesn't exist (per-party pull; the app's manual claim is the fallback).
- Subaccord picker gates `aggregation == Plurality` (mirrors on-chain gate at `open_case`).
- Crypto unchanged (ADR-0015): import `@useaccord/sdk/evidence`; nothing hand-rolled in app or daemon.
- Branding per BRAND.md: `#0A0E14` bg, muted `#7D8590`, amber `#F0A830` accent; logo = "The Assembly" (N muted nodes converge → one amber verdict diamond); lockup `SYNOD / Convene the verdict.`

### 4. Business Logic (pseudo-code)

```
resolveSynodAction(case, disputeState, now):
  Opening && joined == fullmask(party_count)        → synod_file_dispute
  Opening && now > join_deadline && joined partial  → synod_refund_roster_miss (per joined-unpaid party)
  Live && dispute in {Final, Failed}                → synod_claim (per party: paid_out bit clear AND ATA exists)
  else                                              → null

manifestGET(case):
  bundles = store.group(case)            # per-slot
  if disputeBound(case):
    expected = dispute.evidence_hashes[0]
    actual   = H(case_pda ‖ h_0 ‖ … ‖ h_{party_count-1})
    verified = (actual == expected); if !verified → refuse juror assembly
  return assembledManifest(bundles, partyField, verified?)
```

### 5. Definition of Done

- [ ] `apps/synod` builds + lints + pure-logic tests pass; workspace `pnpm -r lint` + `build` green
- [ ] open → join (with evidence push) → file → claim flow manually verified against Surfpool
- [ ] cranker `synod-state` resolver unit tests green; sweep registered in dispatch
- [ ] daemon tests: slot guard, 409 post-file push, manifest verify happy + mismatch, deliver bridge
- [ ] docs touched where behavior is referenced (README workspace map, daemon docs if they list routes)

### 6. Test Matrix (Given / When / Then)

- Given full roster joined, When reconciler scans, Then `synod_file_dispute` action for the case
- Given deadline passed + incomplete roster, When scan, Then refund action per joined-unpaid party; replay no-ops on `paid_out` bit
- Given dispute Final + ruling `i < party_count`, When claim sweep, Then party `i` paid the pot once; replay no-op
- Given dispute already filed, When `POST /evidence/synod/:case/:slot`, Then 409
- Given assembled hashes ≠ `evidence_hashes[0]`, When `GET /evidence/synod/:case`, Then `verified: false` + juror assembly refused
- Given connected wallet ∈ `parties[]` with joined bit clear, When home, Then case listed in "Cases awaiting you"

### 7. Open Questions

- None — all resolved in the 2026-08-18 grilling session (see epic/task bodies for the per-decision record).
