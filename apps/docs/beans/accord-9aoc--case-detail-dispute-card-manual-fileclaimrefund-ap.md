---
# accord-9aoc
title: Case detail - dispute card + manual file/claim/refund + app tests
status: completed
type: task
created_at: 2026-08-18T19:14:12Z
updated_at: 2026-08-18T19:14:12Z
parent: accord-5fe9
---

Dispute status card + deep link to apps/app DisputeDetail (canon DisputeStatusCard pattern). Manual escape-hatch buttons: file_dispute (full roster), claim (own share), refund_roster_miss (deadline missed). Pure-logic tests canon-style (state machine, roster masks, fee previews); pnpm -r lint + build green.

## Summary of Changes

- `features/case/CaseDetailPage.tsx` (`/cases/:address`): fetches `SynodCase` → bound `Dispute` → hosting `Subaccord` (fee token) → recovered case nonce; renders roster with joined/paid bits, `DisputeStatusCard` (canon pattern; option labels = roster shorts + "No party prevails" at `party_count`; deep link `VITE_ACCORD_APP_URL/#/disputes/:addr`), and the three manual escape hatches wired through the SDK: `fileDispute` (Opening + full roster, permissionless), `claim` (Live + dispute Final/Failed, signer a party with payout due; winner/neutral/Failed preview text), `refundRosterMiss` (Opening + deadline passed + partial roster, joined-unpaid party). All sends via shared `sendInstruction` + `describeError`, queries invalidated on success.
- `features/case/caseDetail.ts` — pure logic TDD'd (18 tests): roster masks, `resolveCaseActions` state machine (milestone §6 rows 1–3), `payoutPreview` mirroring on-chain `claim` (winner pot N·S−fee, neutral ⌊·/N⌋ + last-claimant remainder, full-S Failed refund; u64::MAX no-ruling sentinel per ADR-0025), `recoverCaseNonce`.
- `features/case/DisputeStatusCard.tsx` + `shared/format.ts` dispute helpers (`DISPUTE_STATE_LABELS`, `formatRuling`, `formatTimestamp`) — canon-shaped.
- **Root-cause fix beyond the bean:** `SynodCase` stores no seed backrefs (SPEC §Instructions #3), so the previous form nonce (`Date.now()`) made every case unactionable downstream (this page, the cranker, home). NewCasePage now uses probe-on-open sequential nonces (`nextCaseNonce`, 0..63) and `recoverCaseNonce` re-derives them by pure PDA probing — the buttons work from a bare case address.

Verify: app lint ✅ build ✅ tests 40/40 ✅; browser smoke on built bundle — `/#/cases/:addr` renders not-found path against devnet with zero page errors, `/cases/new` + `/` intact; workspace CI trio exit 0.
