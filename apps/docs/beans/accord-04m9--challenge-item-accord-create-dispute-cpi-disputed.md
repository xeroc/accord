---
# accord-04m9
title: challenge_item + Accord create_dispute CPI (Disputed)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-1eoy
blocked_by:
    - accord-7tsl
---

Target: `programs/canon/src/instructions/challenge_item.rs`.
Change: `challenge_item(ctx, item, evidence)` → revert if state==Disputed; compute `challenge_stake = challenge_pct * accumulated_stake / 10_000`; transfer `challenge_stake + accord_fee` (fee_mint, accord_fee = N * fee_per_juror from the list's Subaccord) from challenger to vault; item → Disputed; CPI Accord `create_dispute(options=[keep, remove], evidence_hash, accord_fee)` (Canon = single filer, ADR-0004); store the Dispute pubkey + challenger on the item. Usable from Pending/Listed/WithdrawPending.
Acceptance (TDD): LiteSVM — locks stake+fee, item Disputed, dispute created with options [keep,remove]; reverts if Disputed or insufficient funds.
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #4; Q7 (dollar flows); ADR-0004 (single-party).
