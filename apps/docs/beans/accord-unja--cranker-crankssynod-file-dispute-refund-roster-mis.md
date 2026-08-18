---
# accord-unja
title: Cranker - cranks/synod file-dispute + refund-roster-miss
status: completed
type: task
priority: normal
created_at: 2026-08-18T19:14:13Z
updated_at: 2026-08-18T19:14:38Z
parent: accord-jm1g
blocked_by:
    - accord-i1mp
---

CrankKind grows synod_file_dispute | synod_refund_roster_miss | synod_claim; executors src/cranks/synod/ via registerCrank. file_dispute needs the four Accord CPI extras + fee vault wiring (see packages/synod fileDispute facade); refund loops joined-unpaid parties with their ATAs.

## Summary of Changes

- `apps/cranker/src/cranks/synod/file-dispute.ts` (new) — re-checks Opening + full roster, then wires the full CPI set: `findBoundDisputePda(case)` + `accordStatePda(programId)` + the Subaccord fee_vault ATA ride the facade's `remainingAccounts`; vault = `findCaseVaultPda(feeToken, case)`; fee mint read off the Subaccord.
- `apps/cranker/src/cranks/synod/refund-roster-miss.ts` (new) — sweeps every joined-unpaid party from `action.partyIndex` (one tx per party; snapshot bits only get MORE set, so no double-pay window), skips parties whose fee_token ATA doesn't exist (`accountExists` probe — manual pull with any owned token account is the fallback), deadline NOT re-checked (on-chain guard, canon advance_pending note).
- `apps/cranker/src/cranks/synod/case-seeds.ts` (new) — **the design decision of this bean**: `SynodCase` stores no seed backrefs, so the cranker recovers `(opener=parties[0], nonce)` via a bounded LOCAL scan over `findCasePda` (NONCE_SCAN_CAP = 4_096; ~3.4ms per probe measured on this stack — Kit has no batch API). Cached per case for the process lifetime INCLUDING misses (nonce immutable → an unrecoverable case must not rescan every cycle). ⚠ Openers wanting crank coverage must use small sequential nonces; Date.now()-style nonces are unreachable — the skip reason says so. The synod-app lane should honor this (per-opener counter).
- `apps/cranker/src/util.ts` — `fetchSynodCase` (canon-fetcher mirror) + `accountExists` (raw existence probe for the ATA gate).
- Wiring: `src/index.ts` fullDispatch registers both synod cranks (synod_claim stays with accord-y608); `dispatch.test.ts` completeness extended to the two new kinds.
- Tests: `case-seeds.test.ts` — 5 cases (small-nonce recovery, nonce-0 fast path, cap boundary ±1, wrong-opener null, cache short-circuit). Cranker suite 81/81; workspace `pnpm -r lint/build/test` all exit 0.
