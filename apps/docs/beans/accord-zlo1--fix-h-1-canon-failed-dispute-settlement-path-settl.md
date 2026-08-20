---
# accord-zlo1
title: 'Fix H-1: canon Failed-dispute settlement path (settle_item)'
status: completed
type: task
priority: critical
created_at: 2026-08-19T01:07:16Z
updated_at: 2026-08-19T01:45:30Z
---

settle_item dead-ends on DisputeState::Failed (ruling() is Final-only): item stuck Disputed, challenger challenge_stake permanently locked. Implement the Failed branch: accumulated_stake -> submitter, challenge_stake -> challenger (no bounty), item -> Removed, zero bookkeeping, new event. Reconcile SPEC.md:148-150 (remove-with-no-bounty, drop flag-for-revisit). LiteSVM TDD + e2e via forceDisputeOutcome. Found by accord-mbrk review (reports/canon/security-review.md).

## Summary of Changes (H-1 fix, 2026-08-19)

- settle_item.rs: new DisputeState::Failed branch — accumulated_stake -> submitter, challenge_stake -> challenger (refund, not bounty: the court failed, not the parties), item -> Removed, challenge bookkeeping zeroed, ItemSettlementVoided emitted. Disputed is no longer a dead-end; the challenger stake has an outflow (shared-base 22.1/26.7).
- events.rs: ItemSettlementVoided {list, item, dispute, submitter_refund, challenger_refund}.
- SPEC.md reconciled: instruction #5 row, state-machine diagram (failed edge), edge-case bullet rewritten (was: unimplemented 'flag for revisit'); also documents remove returning the challenger's own stake (closes review I-1).
- TDD: settle_failed_dispute_refunds_both_parties RED (DisputeNotFinal) -> GREEN. e2e: canon.challenge.spec.ts drives a real challenge_item CPI, forces terminal Failed via synod-harness forceDisputeOutcome, asserts balances/Removed/cleared bookkeeping. e2e needed armCanonJurors — Accord's create_dispute intake gate requires staker_count >= min_jury_size (InsufficientJurors otherwise).
- Verified: cargo test -p canon 32/32; anchor test canon.challenge.spec.ts PASS; make lint green. No commit made (per instruction).
