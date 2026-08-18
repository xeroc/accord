---
# accord-y608
title: Cranker - synod claim sweep (ATA gate) + dispatch wiring
status: completed
type: task
priority: normal
created_at: 2026-08-18T19:14:13Z
updated_at: 2026-08-18T19:14:38Z
parent: accord-jm1g
blocked_by:
    - accord-unja
---

Claim sweep post-Final/Failed: per party with paid_out bit clear AND existing fee_token ATA (skip missing - app manual claim is the fallback). Winner pot / neutral floor-share + remainder drain / Failed full-S. Register + end-to-end dispatch test.

## Summary of Changes

- `apps/cranker/src/cranks/synod/claim.ts` (new) — the claim sweep executor. Re-checks case Live + dispute Final/Failed, then dispatches on the Final ruling exactly like the resolver and the on-chain handler: ruling `< party_count` → the prevailing party alone (one-shot pot `N·S − fee`; non-winner claims are deliberate on-chain no-ops and must not burn a tx), neutral ruling → every joined-unpaid party from `action.partyIndex` (floor share; the last claimant drains the remainder on-chain), `Failed` → every party pulls full `S`. Per-party ATA gate: a party whose `fee_token` ATA doesn't exist is logged + skipped — never blocks the others (the app's manual claim is the fallback). `paid_out` bits make mid-sweep failures resumable next cycle. Invariant-break guards mirror the chain: Final + `NO_RULING` → skipped, ruling above neutral → skipped (InvalidRuling).
- Registration (`src/index.ts` fullDispatch + `dispatch.test.ts` ALL_KINDS + header counts): all 17 kinds now registered — 11 Accord + 3 Canon + 3 Synod. The dispatch union from accord-i1mp is fully wired.
- `src/cranks/synod/claim.test.ts` (new) — the bean-mandated end-to-end dispatch tests: real `CrankDispatch` + registered handler driven through a fake RPC (base64-encoded synthetic SynodCase/Dispute/Subaccord — the exact shape the generated Kit fetchers parse) with a capturing `sendIx`. Covers: winner-only claim (both ATAs exist, only slot 1's tx fired, metas verified: case/dispute/vault/party ATA), neutral sweep (2 txs in slot order), Failed + missing opener ATA (opener skipped with log, party 1 still paid), winner-already-paid skip, still-resolving dispute skip (DisputeNotFinal), non-Live case skip.
- Found + fixed during the test drive: `unpaidJoined` received the `Account<SynodCase>` wrapper instead of `.data` (empty sweep, silent skip) — caught precisely because the dispatch test asserts tx counts.
- Cranker suite 87/87 (case-seeds 5, claim 6, dispatch completeness 3, resolver + reconciler phases); workspace `pnpm -r lint/build/test` all exit 0.
