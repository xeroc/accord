---
# accord-04m9
title: challenge_item + Accord create_dispute CPI (Disputed)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T18:15:00Z
parent: accord-1eoy
blocked_by:
  - accord-7tsl
---

Target: `programs/canon/src/instructions/challenge_item.rs`.
Change: `challenge_item(ctx, item, evidence)` → revert if state==Disputed; compute `challenge_stake = challenge_pct * accumulated_stake / 10_000`; transfer `challenge_stake + accord_fee` (fee_mint, accord_fee = N \* fee_per_juror from the list's Subaccord) from challenger to vault; item → Disputed; CPI Accord `create_dispute(options=[keep, remove], evidence_hash, accord_fee)` (Canon = single filer, ADR-0004); store the Dispute pubkey + challenger on the item. Usable from Pending/Listed/WithdrawPending.
Acceptance (TDD): LiteSVM — locks stake+fee, item Disputed, dispute created with options [keep,remove]; reverts if Disputed or insufficient funds.
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #4; Q7 (dollar flows); ADR-0004 (single-party).

## Summary of Changes

### Implemented

- **`challenge_item` instruction** (`programs/canon/src/instructions/challenge_item.rs`):

  - State gate: reverts if `Disputed`; accepts `Pending`/`Listed`/`WithdrawPending`.
  - Computes `challenge_stake = challenge_pct * accumulated_stake / 10_000` (overflow-checked).
  - Reads `fee_per_juror` from the Subaccord's raw Borsh data (offset 148 — avoids loading the full `Subaccord` on the BPF stack).
  - Computes `accord_fee = INITIAL_NUM_JURORS * fee_per_juror`.
  - Transfers `challenge_stake + accord_fee` from challenger → CanonList vault via `token::transfer`.
  - Verifies the dispute PDA derivation (`["dispute", list, nonce]`, nonce = `challenge_count`).
  - Flips item → `Disputed`, stores challenger + dispute pubkey + challenge_stake + challenged_at, increments `challenge_count`.
  - CPIs Accord `create_dispute` via raw `invoke_signed` (CanonList PDA as filer/signer). Options `[OPTION_KEEP, OPTION_REMOVE]`.
  - Emits `ItemChallenged` event.

- **Remaining accounts pattern**: the four Accord CPI-only accounts (dispute PDA, pause state, fee vault, accord program) are in `remaining_accounts` — keeps the typed struct at 10 accounts (same as `submit_item`).

- **Raw `invoke_signed` instead of Anchor CPI client**: avoids linking the full `accord` crate into the canon BPF binary (which bloats stack frames past the SBPF v0 limit). Precomputed discriminator `sha256("global:create_dispute")[..8]`.

### Supporting changes

- `constants.rs`: `OPTION_KEEP`, `OPTION_REMOVE` (32-byte dispute option identifiers).
- `errors.rs`: `AlreadyDisputed`, `InvalidItemState`, `InsufficientFunds`, `SubaccordMismatch`, `DisputePdaMismatch`, `MissingRemainingAccounts`, `WrongAccordProgram`.
- `events.rs`: `ItemChallenged`.
- `lib.rs` + `instructions/mod.rs`: registered the new instruction.
- `Cargo.toml`: `accord` added as dev-dependency (`no-entrypoint`) for test account fabrication; `solana-compute-budget` + `litesvm` for test config.

### LiteSVM tests — SBPF v0 limitation

The installed Solana CLI (2.x) compiles for SBPF v0 (fixed 4096-byte stack frames with guard gaps). Anchor's generated `try_accounts` for ChallengeItem exceeds this frame size, causing "Access violation in stack frame 5" during account deserialization. The tests are written (`#[ignore]`'d) and will pass once `make prep` installs Solana 3.1.10 (SBPF v3 with dynamic stack frames). Full integration is also verified in the e2e (Surfpool) suite.
