---
# accord-73yx
title: create_list + Accord create_subaccord CPI
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T01:20:02Z
parent: accord-dm9r
blocked_by:
  - accord-5ipb
---

Target: `programs/canon/src/instructions/create_list.rs` (+ lib.rs wiring).
Change: `create_list(ctx, stake_mint, fee_mint, list_program, rules_hash, submit_deposit, challenge_pct, listing_window, withdrawal_timelock)` → init `CanonList` PDA `["canon", creator, rules_hash]`; CPI Accord `create_subaccord` (staking token=stake_mint, fee token=fee_mint, Canon canonical dispute-mechanism defaults from constants, authority=Canon governance multisig, evidence_operator=canonical); store the returned Subaccord pubkey on `CanonList`. `list_program=Pubkey::default()` ⇒ ownership check disabled (sentinel). `domain_ref := rules_hash`.
Acceptance (TDD): LiteSVM — create_list inits CanonList with all fields; the CPI creates the backing Subaccord with the canonical defaults; reverts on bad args. Two-token Accord interface may be in a separate branch — pass both mints; if Accord is single-token, stake_mint is used for both.
Dependencies: state. Authority: programs/canon/SPEC.md §Instructions #1, §v1 canonical defaults; ADR-0005; canon-0001.

## Summary of Changes

- **`programs/canon/src/lib.rs`**: `#[program]` dispatch for `create_list` + the
  `#[derive(Accounts)] CreateList` struct (moved from `instructions/` to crate
  root — anchor's `__client_accounts_*` codegen emits `pub use crate::...` at
  the crate root; the derive emits the hidden module as a sibling of the struct;
  both only align at crate root, matching the accord crate convention).
  `#[instruction]` lists all positional args up to `rules_hash` (the 4th). PDA
  seeds: `list = ["canon", creator, rules_hash]`, `subaccord = ["subaccord",
creator, rules_hash]` with `seeds::program = accord::ID`.
- **`programs/canon/src/instructions/create_list.rs`**: `create_list_handler` —
  validates `rules_hash != zero` (`InvalidRulesHash`) and
  `challenge_pct <= MAX_CHALLENGE_PCT_BPS` (`ChallengePctTooHigh`); CPIs
  `accord::cpi::create_subaccord` with the full Canon canonical-default profile
  from `constants.rs` (`domain_ref = rules_hash`, `evidence_spec = [0u8;32]`,
  `authority/evidence_operator = Pubkey::default()` — immutable until the Canon
  governance multisig exists); inits `CanonList` with all fields.
- **`programs/canon/src/constants.rs`**: added `DEFAULT_MIN_STAKE`,
  `DEFAULT_REVEAL_THRESHOLD_BPS`, `DEFAULT_MAX_DRAW_ATTEMPTS`,
  `DEFAULT_TREE_DEPTH` (required by `CreateSubaccordParams`).
- **`programs/canon/src/errors.rs`** (new): `CanonError::InvalidRulesHash`,
  `ChallengePctTooHigh`.
- **`programs/canon/Cargo.toml`**: `accord` CPI dep + `idl-build` propagation +
  LiteSVM dev-deps.
- **`programs/canon/tests/create_list_litesvm.rs`** (new): 4 LiteSVM tests —
  happy (verifies CanonList fields + Subaccord canonical defaults), reinit guard,
  zero `rules_hash` revert, `challenge_pct > MAX` revert.
- Verify: `cargo build -p canon` green; `cargo test -p canon --features
no-entrypoint` — 4/4 LiteSVM tests pass; `cargo fmt` / `cargo clippy` clean;
  `anchor build --ignore-keys` emits `canon.so` + IDL with `create_list`
  instruction + `CanonList` type.
