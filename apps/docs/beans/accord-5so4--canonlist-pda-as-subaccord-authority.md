---
# accord-5so4
title: CanonList PDA as Subaccord authority
status: in-progress
type: task
created_at: 2026-08-14T17:22:25Z
updated_at: 2026-08-14T17:22:25Z
---

create_list currently passes authority: Pubkey::default() to the create_subaccord CPI, making every backing court permanently immutable — the retuning upgrade path is burned at birth. Change: Subaccord.authority = the just-created CanonList PDA ([canon, creator, rules_hash]); CanonList.authority mirrors it. A future canon instruction (not yet built) gates retuning and CPIs accord propose/execute_subaccord_update with the list PDA as invoke_signed signer — precedent exists (settle_item/advance_withdrawal already sign vault transfers with the list PDA). No signing change at creation: authority only matters when exercising power. Ripples: create_list_litesvm assertions, 5 fabricated CanonList fixtures (Rust) + jest fabricateCanonList, SPEC authority paragraph, state.rs field doc, ponytail comments.
