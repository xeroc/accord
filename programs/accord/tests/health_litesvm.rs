#![cfg(feature = "no-entrypoint")]
//! LiteSVM harness for the Accord program (veridao-8ys4).
//!
//! Testing decision — BOTH harnesses, complementary:
//!   - **LiteSVM** (this file, `cargo test`) — fast in-process Rust unit/TDD
//!     per instruction. No validator; deterministic; full sysvar/clock control.
//!   - **jest + Surfpool** (`../../tests/`) — full e2e: CPI chains, VRF,
//!     real validator behaviour, wallet flows.
//!
//! Wiring uses `anchor-litesvm` 0.1.x — the only line pinned to anchor-lang
//! 0.31 (0.2+ jumped to anchor 1.x; raw litesvm 0.11/0.15 pull a solana-crate
//! split that doesn't compile against anchor 0.31). It wraps litesvm 0.6 with a
//! single, self-consistent solana-3.x dep set and a typed Anchor builder:
//! `ctx.program().accounts(..).args(..).instruction()` ->
//! `ctx.execute_instruction(ix, &[&kp]).assert_success()`.
//!
//! The safe-solana-builder `references/litesvm.md` remains the *checklist/pattern*
//! authority for every instruction bean: per-instruction happy path + auth +
//! reinit + time-lock + arithmetic + closure, sysvar manipulation, CU profiling.
//!
//! Dev loop: `anchor build` (or `cargo build-sbf`) emits `target/deploy/accord.so`,
//! then `cd programs/accord && cargo test`. The panic below points here if the
//! .so is missing. One fresh `AnchorLiteSVM::build_with_program` context per
//! test — never share `LiteSVM`/`Keypair` across tests.

use accord::{accounts::Health as HealthAccts, instruction::Health as HealthIx, ID};
use anchor_litesvm::AnchorLiteSVM;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::path::PathBuf;

/// Read the compiled program .so. Requires `anchor build` / `cargo build-sbf`.
fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

/// Hello-world round-trip (veridao-8ys4 acceptance). Proves the harness wires
/// end-to-end: program loads, `health` dispatches, tx commits, runtime acks.
/// Subsequent instructions add their own `#[test]`s next to this one, each with
/// a fresh context, following the litesvm.md coverage matrix.
#[test]
fn health_round_trips() {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());

    // The program's `Health` accounts struct requires a `Signer` named `caller`.
    // Fund a fresh keypair; `execute_instruction` uses signers[0] as fee payer.
    let caller = Keypair::new();
    ctx.svm
        .airdrop(&caller.pubkey(), 50 * LAMPORTS_PER_SOL)
        .expect("airdrop caller");

    let ix = ctx
        .program()
        .accounts(HealthAccts {
            caller: caller.pubkey(),
        })
        .args(HealthIx {})
        .instruction()
        .expect("build health instruction");

    ctx.execute_instruction(ix, &[&caller])
        .expect("execute health tx")
        .assert_success();
}
