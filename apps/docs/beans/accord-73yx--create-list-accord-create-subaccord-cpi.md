---
# accord-73yx
title: create_list + Accord create_subaccord CPI
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-dm9r
blocked_by:
    - accord-5ipb
---

Target: `programs/canon/src/instructions/create_list.rs` (+ lib.rs wiring).
Change: `create_list(ctx, stake_mint, fee_mint, list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock)` → init `CanonList` PDA `["canon", creator, rules_hash]`; CPI Accord `create_subaccord` (staking token=stake_mint, fee token=fee_mint, Canon canonical dispute-mechanism defaults from constants, authority=Canon governance multisig, evidence_operator=canonical); store the returned Subaccord pubkey on `CanonList`. `list_program=Pubkey::default()` ⇒ ownership check disabled (sentinel). `risk_type := rules_hash`.
Acceptance (TDD): LiteSVM — create_list inits CanonList with all fields; the CPI creates the backing Subaccord with the canonical defaults; reverts on bad args. Two-token Accord interface may be in a separate branch — pass both mints; if Accord is single-token, stake_mint is used for both.
Dependencies: state. Authority: programs/canon/SPEC.md §Instructions #1, §v1 canonical defaults; ADR-0005; canon-0001.
