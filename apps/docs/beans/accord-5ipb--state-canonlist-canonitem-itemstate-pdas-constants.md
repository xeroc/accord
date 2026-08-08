---
# accord-5ipb
title: State — CanonList, CanonItem, ItemState, PDAs, constants
status: completed
type: task
priority: high
created_at: 2026-08-07T23:00:47Z
updated_at: 2026-08-08T02:40:00Z
parent: accord-4y4i
blocked_by:
  - accord-k6us
---

Target: `programs/canon/src/state.rs` (+ `constants.rs`).
Change: define `CanonList` and `CanonItem` structs with the fields/seeds in programs/canon/SPEC.md §Account/PDA model; `ItemState` enum (Pending/Listed/Removed/WithdrawPending/Disputed); PDA seed constants (`["canon", creator, rules_hash]`, `["canon-item", list, account]`); the v1 canonical-default constants from programs/canon/SPEC.md §v1 canonical defaults (initial*num_jurors=3, max_appeals=3, alpha_bps=1000, fee_per_juror=10, submit_deposit=500, challenge_pct=5000 bps, listing_window/withdrawal_timelock=5d) + `MAX*\*`. Anchor `#[derive(InitSpace)]`.
Acceptance: structs compile; every field/seed matches SPEC; defaults present as named constants.
Dependencies: scaffold.

## Summary of Changes

- `programs/canon/src/constants.rs` (new): PDA seed prefixes (`SEED_CANON_LIST = b"canon"`, `SEED_CANON_ITEM = b"canon-item"`); the full v1 canonical-default profile from SPEC §v1 canonical defaults — dispute-mechanism defaults passed to the backing Subaccord (`INITIAL_NUM_JURORS = 3` [Accord fixed protocol constant, restated], `DEFAULT_MAX_APPEALS = 3`, `DEFAULT_ALPHA_BPS = 1000`, review/commit/reveal = 7d/2d/2d, `DEFAULT_APPEAL_WINDOW_SECS = 3d`, `DEFAULT_FEE_PER_JUROR = 10`) + list-level defaults (`DEFAULT_SUBMIT_DEPOSIT = 500`, `DEFAULT_CHALLENGE_PCT_BPS = 5000`, `DEFAULT_LISTING_WINDOW_SECS = 5d`, `DEFAULT_WITHDRAWAL_TIMELOCK_SECS = 5d`); `MAX_CHALLENGE_PCT_BPS = 10_000` (the one domain-meaningful ceiling — challenge stake cannot exceed accumulated).
- `programs/canon/src/state.rs` (new): `ItemState` enum (Pending/Listed/Removed/WithdrawPending/Disputed — exactly the five variants the bean specifies; no `Withdrawn` since a completed withdrawal lands in `Removed`); `CanonList` `#[account] #[derive(InitSpace)]` with every SPEC key field (creator, stake_mint, fee_mint, list_program [immutable], rules_hash [immutable seed], subaccord, submit_deposit, challenge_pct, listing_window, withdrawal_timelock, authority, item_count, bump); `CanonItem` `#[account] #[derive(InitSpace)]` (account, list back-ref, submitter, state, accumulated_stake, submitted_at, challenge_count + active-challenge bookkeeping [active_dispute/challenger/challenge_stake/challenged_at], withdrawal_requested_at: Option<i64>, bump). Field-for-field + seed verified against SPEC §Account/PDA model.
- `programs/canon/src/lib.rs`: wired `pub mod constants` / `pub mod state` + re-exports (mirrors the accord crate root).
- Conventions mirror accord: every account stores its canonical `bump`; `i64` timestamps from Clock; field-level doc comments tying each field to SPEC semantics; `#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]` on the enum. No `seeds()` helper methods on the structs — accord derives PDAs inline in `#[derive(Accounts)]` and keeps PDA helpers in the TS SDK, so the speculative helpers were removed (surgical).
- Verify: `cargo check -p canon --all-features` green; `cargo fmt -p canon -- --check` clean; `cargo clippy` 0 warnings on authored files (constants.rs/state.rs); `anchor build --ignore-keys` emits `canon.so`. Note: the IDL `types` list is empty because Anchor only emits types reachable from instructions — canon has none yet; the structs compile with `#[derive(InitSpace)]` and will surface in the IDL once `create_list`/`submit_item` reference them.
