---
# accord-7tsl
title: submit_item (ownership check, lock deposit, Pending)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T01:00:04Z
parent: accord-6vih
blocked_by:
    - accord-5ipb
---

Target: `programs/canon/src/instructions/submit_item.rs`.
Change: `submit_item(ctx, list, account: AccountInfo, evidence, deposit=submit_deposit)` → if `list.list_program != Pubkey::default()`, require `account.owner == list.list_program`; transfer `submit_deposit` (fee_mint) from submitter to the CanonList vault; init `CanonItem` PDA `["canon-item", list, account]` state=Pending, accumulated_stake=submit_deposit, submitter=signer.
Acceptance (TDD): LiteSVM — locks deposit, item Pending; ownership check passes when owner matches / when sentinel; reverts on owner mismatch and on duplicate item (PDA collision); works for arbitrary base58 `account` when sentinel.
Dependencies: state. Authority: programs/canon/SPEC.md §Instructions #2; Q15/Q16 (list_program + permissionless submit).
