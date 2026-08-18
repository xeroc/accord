---
# accord-nf9j
title: file_dispute CPI — options/evidence derivation + fee transfer (TDD)
status: completed
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T11:05:00Z
parent: accord-l2ad
blocked_by:
    - accord-ubmq
---

assigned: implementer
Full roster gate (early lock, no deadline wait), check-and-set Opening→Live. options[i]=H("synod-opt"‖case_pda‖i), options[N]=neutral at highest index; evidence_hash[0]=H(case_pda‖evidence[0..N]). CPI accord create_dispute with case PDA as filer signer (invoke_signed, seeds ["case",opener,nonce]) and case vault ATA as filer_token_account; nonce 0; fee from vault (vault == N*S−fee after). Bind dispute PDA field. Tests: CPI account-set mirror of canon challenge_item, double-file rejection, vault invariant, 7-party options len == 8, hash derivation vectors.

## Summary of Changes

TDD: RED (`accounts::FileDispute` missing — compile failure) → GREEN → fmt/clippy clean.

- `src/instructions/file_dispute.rs`: pure derivation helpers `option_label(case, i) = H("synod-opt"‖case‖i_le64)` (neutral at index `party_count`, always highest) and `evidence_root(case, evidence, n) = H(case‖e0‖…‖e_{n-1})` — host unit-tested vectors in-module (7-party ⇒ 8 distinct labels; padded slots excluded from the root).
- Handler: remaining-account checks (len ≥ 4, program == accord::ID) → state check-and-set Opening→Live (double-file impossible) → full-roster bitmask gate (early lock) → dispute PDA verified against `accord::dispute_pda(case, 0)` → bind `case.dispute` + flip state → CPI `accord::cpi::create_dispute(options, evidence_hash, 0, frozen_fee)` with case-PDA `invoke_signed` seeds `["case", opener, nonce, bump]`, vault as `filer_token_account`. Account set mirrors canon `challenge_item` (4 accord CPI-only accounts via remaining_accounts).
- **Signature note:** `SynodCase` stores no opener/nonce backrefs (SPEC field list is authority), so `file_dispute` takes `opener: UncheckedAccount` + `nonce: u64` (case-open nonce) — the seeds constraint re-derives the case PDA from them, validating both. SPEC row 3 updated to `file_dispute(case, opener, nonce)` as built. Same seed question will face refund/claim (accord-arch).
- Error.rs: + `MissingRemainingAccounts`, `WrongAccordProgram`, `DisputePdaMismatch` (canon-parity names).
- Cargo.toml: `solana-program` dep (hashv — anchor no longer re-exports hash).
- Tests (`tests/file_dispute_litesvm.rs`, both programs deployed; accord-side fixtures: Subaccord with staker_count=3, unpaused AccordState, empty fee_vault): incomplete roster / not-opening (double-file) / wrong dispute PDA / wrong accord program / missing remaining accounts — all pin the anchor error CODE. Happy path + vault==N·S−fee invariant is `#[ignore]`d with canon's exact LiteSVM reason (data-carrying case-PDA rent-payer forces allocate+transfer path; sound on real Solana) — Surfpool e2e (accord-al8h) validates.

### Verification

- `cargo test -p synod --features no-entrypoint`: 22 tests, 21 green + 1 documented ignore (4 host incl. derivation vectors, 5 join, 5 file, 8 open_case).
- Root `cargo test`: workspace green.
- `anchor build --ignore-keys`: green; IDL carries `file_dispute`.
- `cargo clippy -p synod --all-targets --features no-entrypoint`: 0 warnings; fmt clean.
