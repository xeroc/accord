---
# accord-7tsl
title: submit_item (ownership check, lock deposit, Pending)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T03:30:00Z
parent: accord-6vih
blocked_by:
  - accord-5ipb
---

Target: `programs/canon/src/instructions/submit_item.rs`.
Change: `submit_item(ctx, list, account: AccountInfo, evidence, deposit=submit_deposit)` → if `list.list_program != Pubkey::default()`, require `account.owner == list.list_program`; transfer `submit_deposit` (fee_mint) from submitter to the CanonList vault; init `CanonItem` PDA `["canon-item", list, account]` state=Pending, accumulated_stake=submit_deposit, submitter=signer.
Acceptance (TDD): LiteSVM — locks deposit, item Pending; ownership check passes when owner matches / when sentinel; reverts on owner mismatch and on duplicate item (PDA collision); works for arbitrary base58 `account` when sentinel.
Dependencies: state. Authority: programs/canon/SPEC.md §Instructions #2; Q15/Q16 (list_program + permissionless submit).

## Summary of Changes

- `programs/canon/src/instructions/submit_item.rs` (new): `SubmitItem` accounts struct (`init` CanonItem PDA `["canon-item", list, account]`, CanonList PDA-seed-verified, `init_if_needed` vault, `UncheckedAccount` for the curated account with CHECK doc) + `handler` — requires `deposit == list.submit_deposit` (defense-in-depth, mirrors Accord `FeeMismatch`), ownership gate (`account.owner == list.list_program`, skipped on sentinel `Pubkey::default()`), SPL transfer of the deposit from submitter ATA → CanonList vault (fee-on-transfer safe via reload + delta credit), inits CanonItem `state=Pending`, `accumulated_stake=delta`, `submitter=signer`, bumps `item_count`, emits `ItemSubmitted`.
- `programs/canon/src/instructions/mod.rs` (new): module hub re-exporting `submit_item`.
- `programs/canon/src/errors.rs` (new): `CanonError` — `OwnerMismatch`, `DepositMismatch`, `ArithmeticOverflow`.
- `programs/canon/src/events.rs` (new): `ItemSubmitted` event (list, item, account, submitter, deposit, evidence).
- `programs/canon/src/lib.rs`: wired `pub mod {errors, events, instructions}` + re-exports; `#[program] mod canon` with the `submit_item` dispatcher (one-line delegation to `instructions::submit_item::handler`).
- `programs/canon/Cargo.toml`: added `anchor-spl.workspace = true` (token + associated_token for the deposit transfer); `idl-build` feature extended with `anchor-spl/idl-build`; dev-dep block mirroring `programs/accord/Cargo.toml` (anchor-litesvm 0.4, solana-sdk/program 3, spl-token 9, spl-associated-token-account 8).
- `programs/canon/tests/submit_item_litesvm.rs` (new): 4 LiteSVM tests — happy path (TOKEN_PROGRAM_ID-owned account; deposit locked in vault, item Pending, accumulated_stake == deposit, item_count++), sentinel (arbitrary system-owned account accepted), revert on owner mismatch (system-owned vs TOKEN_PROGRAM_ID list_program), revert on duplicate (PDA collision on second submit). Fabricates the `CanonList` account directly (create_list bean accord-73yx not yet built) using `AccountSerialize::try_serialize` + manual SVM `set_account`, mirroring the accord accumulator test's SPL fabrication helpers.
- Verify: `anchor build --ignore-keys` emits `canon.so`; `cargo test -p canon --features no-entrypoint` → 4/4 LiteSVM tests green; `cargo fmt -p canon -- --check` clean; `cargo clippy -p canon --all-features --tests` 0 authored-file warnings (only anchor-macro `cfg` noise).
