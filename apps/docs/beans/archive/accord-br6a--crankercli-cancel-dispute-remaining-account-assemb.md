---
# accord-br6a
title: Cranker/CLI cancel_dispute remaining-account assembly drift (devnet InvalidPanelSize)
status: completed
type: task
priority: normal
created_at: 2026-10-26T15:39:19Z
updated_at: 2026-10-26T15:50:46Z
---

---
# accord-br6a
title: Cranker/CLI cancel_dispute remaining-account assembly drift (devnet InvalidPanelSize)
status: in-progress
type: task
created_at: 2026-10-26T15:39:19Z
updated_at: 2026-10-26T15:39:19Z
---

## Problem
Devnet cranker fails cancel_dispute with InvalidPanelSize (cancel_dispute.rs:261, pre-draw strict accounting): apps/cranker cancel-dispute.ts unconditionally pushes the current-round PDA, but a never-drawn Created dispute (dead VRF oracle — the classic pre-draw stall) has no Round account and on-chain requires remainingAccounts == [].

## Same-family drift (bond seeds / layout contract)
- cranker finalize-dispute.ts pushes AppealBond seeds 1..currentRound; on-chain expects 0..currentRound-1 (appeal.rs seeds the bond with the PRE-bump current_round; the bond round_idx FIELD is the new round — confusion source).
- reconciler.ts claim_refund sweep probes seeds 1..currentRound — first appellant's bond (seed 0) never swept.
- CLI dispute/cancel.ts autoDeriveRemaining: interleaves rounds+bonds in wrong order, dedupes repeat jurors, and pushes 31 stake PDAs per round (iterates fixed jurors array including system sentinels).

## Fix
Single source of truth: SDK deriveCancelDisputeRemainingAccounts (methods/settlement.ts) mirroring the on-chain layout; cranker + CLI consume it. Bond loops corrected to 0..currentRound. Reconciler fetchAppealBond injection for a regression test.

## Acceptance
- SDK unit tests: never-drawn -> [], partial draw, post-appeal pre-draw, post-draw with appeals (layout + bond seeds 0-based).
- Cranker reconciler test: Failed + outstanding bond at seed 0 -> claim_refund roundIdx 0.
- bun tests + workspace build green; changeset added.

Refs: devnet cranker log 2026-10-26T15:29:25Z

## Summary of Changes

Root cause: the cranker pushed the current-round PDA unconditionally, but a never-drawn Created dispute (dead VRF oracle — the devnet case) has no Round account and on-chain strict accounting requires remainingAccounts == []. Same-family drift found + fixed: AppealBond PDA seeds are the round BEING appealed (0-based) — the bond's round_idx FIELD is the round the appeal opened (seed + 1) — and the cranker's finalize_dispute crank + reconciler claim_refund sweep both probed 1..currentRound (first appellant's bond never swept; appealed finalizes revert InvalidMembershipProof).

- [x] SDK `deriveCancelDisputeRemainingAccounts` (methods/settlement.ts) — single-source layout derivation; 5 unit tests pin it (never-drawn → [], partial draw, post-appeal pre-draw, post-draw with 2 appeals, missing prior round throws).
- [x] Cranker cancel-dispute.ts consumes the SDK helper (drops the hand-rolled assembly incl. missing prior rounds).
- [x] Cranker finalize-dispute.ts + reconciler.ts bond loops → 0..currentRound-1; reconciler gains injectable fetchAppealBond + regression test (Failed + bond at seed 0 → claim_refund roundIdx 0).
- [x] CLI dispute:cancel --remaining-accounts auto → SDK helper (old auto: wrong order, deduped repeat jurors, 31 stake PDAs per round incl. sentinels).
- [x] Docs: claim-refund crank comment, skill 04-dispute.md + 06-voting.md layout notes; changeset brave-cranes-refund.

Verification: sdk bun/node tests green (settlement 5/5; pre-existing unrelated lifecycle.test.ts failure untouched), cranker 107/107 + tsc + eslint green, CLI tsup build green, e2e workspace tsc green. On-chain program unchanged — no anchor rebuild needed.
