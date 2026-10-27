---
# accord-ubmq
title: open_case + join — LiteSVM TDD
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T10:15:00Z
parent: accord-l2ad
blocked_by:
    - accord-oeem
---

assigned: implementer
Per SPEC §Instructions 1-2 and HANDOFF §4 pseudo-code. open_case: all §3 validations (2..=7 distinct, opener==parties[0], Plurality gate, N*S>fee, deadline>now) + fee frozen at open from subaccord terms. join: signer==parties[i], bitmask set-once, S transfer to case vault ATA (lazy ATA per canon precedent), evidence[i] frozen at join. LiteSVM tests: happy path, every validation error, double-join rejection, join-after-deadline rejection. Gated #![cfg(feature = "no-entrypoint")] like canon/accord litesvm files.

## Summary of Changes

TDD: RED (tests referencing missing `accounts::OpenCase`/`Join` — compile failure) → GREEN → fmt/clippy refactor pass.

- `src/instructions.rs` → `src/instructions/{mod,open_case,join}.rs` (canon layout: Accounts struct + handler per submodule, thin `#[program]` dispatch in lib.rs; `pub use instructions::*` restored).
- `open_case`: all SPEC §Open-time validations (2..=7 via MIN/MAX_PARTIES, O(n²) distinctness with n≤7, opener==parties[0], Plurality gate, `party_count·stake > fee` strict, `join_deadline > now`). Fee frozen via `subaccord.filing_fee()` — Accord's own `min_jury_size · fee_per_juror` derivation (single source with its `FeeMismatch` check), never re-read. Roster padded with `Pubkey::default()`; case inited wholesale via `set_inner`.
- `join`: signer==`parties[i]` (NotNamedParty), bitmask set-once (AlreadyJoined), `now < join_deadline` strict, `state == Opening` as an Accounts constraint; S transfer party-ATA → case-vault ATA with `init_if_needed` lazy vault (canon precedent) + fee-on-transfer delta defense (`StakeTransferShortfall`); `evidence[i]` frozen at join. Fat accounts `Box`ed — unboxed `Join::try_accounts` blew the 4096-byte BPF stack frame (4640 B), same remedy as canon `challenge_item`.
- `error.rs`: + `ArithmeticOverflow`, `StakeTransferShortfall`.
- `Cargo.toml`: runtime dep `accord = { path = "../accord", features = ["cpi"] }`; `doctest = false` (canon rationale — feature-unification E0463 flake with the accord path dep); description typo "Syncod" fixed.
- Tests (`tests/open_case_litesvm.rs` 8, `tests/join_litesvm.rs` 5, both `#![cfg(feature = "no-entrypoint")]`): fabricated accord-owned `Subaccord` accounts (canon parent-fabrication pattern) — no accord deployment needed (no CPI in these two instructions); error assertions pin the anchor error CODE name, not just failure; happy paths assert frozen fee, bitmask fill, per-slot evidence, vault == N·S. LiteSVM gotcha hit + fixed: repeated txs/airdrops need `expire_blockhash()` or they replay as `AlreadyProcessed`.

### Verification

- `cargo test -p synod --features no-entrypoint`: 15/15 green (2 host layout + 8 open_case + 5 join).
- Root `cargo test`: whole workspace green (canon/accord untouched).
- `anchor build --ignore-keys`: green; `target/idl/synod.json` carries `open_case` + `join` with full account/arg lists.
- `cargo clippy -p synod --all-targets --features no-entrypoint`: 0 warnings; `cargo fmt --check` clean.
- No TS/SDK consumers yet (`packages/synod` doesn't exist) — no codegen ripple possible; noted for the SDK bean.
