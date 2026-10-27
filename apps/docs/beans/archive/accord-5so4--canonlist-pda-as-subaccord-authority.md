---
# accord-5so4
title: CanonList PDA as Subaccord authority
status: completed
type: task
priority: normal
created_at: 2026-08-14T17:22:25Z
updated_at: 2026-08-14T17:28:01Z
---

create_list currently passes authority: Pubkey::default() to the create_subaccord CPI, making every backing court permanently immutable — the retuning upgrade path is burned at birth. Change: Subaccord.authority = the just-created CanonList PDA ([canon, creator, rules_hash]); CanonList.authority mirrors it. A future canon instruction (not yet built) gates retuning and CPIs accord propose/execute_subaccord_update with the list PDA as invoke_signed signer — precedent exists (settle_item/advance_withdrawal already sign vault transfers with the list PDA). No signing change at creation: authority only matters when exercising power. Ripples: create_list_litesvm assertions, 5 fabricated CanonList fixtures (Rust) + jest fabricateCanonList, SPEC authority paragraph, state.rs field doc, ponytail comments.

## Summary of Changes

- programs/canon/src/instructions/create_list.rs: authority passed to the create_subaccord CPI is now the CanonList PDA (list_pda captured pre-CPI); CanonList.authority mirrors it. Ponytail comments replaced with the rationale (default() burns the retuning path; PDA keeps it upgradeable via a future gated canon instruction using invoke_signed — settle_item/advance_withdrawal precedent).
- programs/canon/src/state.rs: CanonList.authority field doc rewritten (self-PDA, retuning-only-through-canon, future instruction explicitly marked not-yet-implemented).
- TDD: create_list_litesvm RED (list.authority/sub.authority == default asserted first, panicked) -> GREEN with assertions == list_pda.
- Fixtures mirror post-change reality: 5 Rust CanonList fabrications (advance_pending, challenge_item, settle_item, submit_item, withdrawal) + jest fabricateCanonList now use list_addr/listAddr as authority. The fabricated accord Subaccord in challenge_item_litesvm keeps default() — any authority is a legal accord state and nothing reads it.
- SPEC.md v1-canonical-defaults authority paragraph rewritten (was: 'Canon governance multisig'; no such key exists — ADR canon-0001 does not lock it, no supersede needed).
- Verified: cargo test -p canon --features no-entrypoint green (2 pre-existing #[ignore] in challenge_item = LiteSVM rent-payer limitation, documented); make test green (17/17 suites, 64 passed, 1 pre-existing env-gated skip); cargo fmt + clippy clean on canon; pnpm -r lint clean. IDL/args/accounts unchanged -> no codegen, no consumer churn.
- Commit 87621ff.
