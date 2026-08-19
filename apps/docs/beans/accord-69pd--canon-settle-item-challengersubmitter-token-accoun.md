---
# accord-69pd
title: 'Canon settle_item: challenger/submitter token accounts are UncheckedAccount — handler never key-checks them (comment claims it does), so a crank caller can redirect the remove bounty / withdrawal-keep payout to arbitrary token accounts. Add constraints (ATA of item.challenger / item.submitter for list.fee_mint) in programs/canon/src/instructions/settle_item.rs + LiteSVM auth test.'
status: completed
type: task
priority: normal
created_at: 2026-08-14T19:58:55Z
updated_at: 2026-08-19T01:45:29Z
---

## Review confirmation (2026-08-19, accord-mbrk)

Confirmed by full safe-solana-builder review (reports/canon/security-review.md, finding C-1). Severity raised to Critical: settle_item.rs:39-46 `UncheckedAccount`s carry false `/// CHECK:` comments; handler has no key/mint/authority check; remove-bounty AND withdrawal-keep payout both redirectable by any crank caller; vault-as-destination variant desyncs accounting. Fix = copy AdvanceWithdrawal's pattern (`token::mint = fee_mint, token::authority = item.challenger|item.submitter`) — constraints run before the handler zeroes the fields.

## Summary of Changes (C-1 fix, 2026-08-19)

- programs/canon/src/instructions/settle_item.rs: challenger/submitter payout accounts are now Account<TokenAccount> pinned via token::mint = fee_mint + token::authority = item.challenger/item.submitter (constraints run before the handler zeroes the fields; vault self-payout also impossible — vault authority is the list PDA).
- Whole SettleItem context boxed + shared vault_pay() helper: the typed accounts otherwise pushed try_accounts past the 4096-byte BPF stack frame (4128>4096, build-time + LiteSVM access-violation).
- TDD: settle_item_litesvm.rs gained 3 RED-then-GREEN auth tests (wrong challenger dest, wrong submitter dest, vault-as-dest). e2e: canon.challenge.spec.ts Failed-dispute test asserts both redirects are rejected on Surfpool.
- Verified: cargo test -p canon 32/32; anchor test canon.challenge.spec.ts PASS (the only remaining suite failure is draw.spec.ts — separate in-flight accord work); make lint green; canon codegen regenerated (doc-only diff).
- No commit made (per instruction).
