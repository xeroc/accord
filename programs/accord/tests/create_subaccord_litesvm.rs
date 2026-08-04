#![cfg(feature = "no-entrypoint")]
//! `create_subaccord` tests (veridao-ek65). LiteSVM exercises the
//! permissionless Subaccord init end-to-end.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy : create with all params -> Subaccord persists every field
//! - reinit: second create at the same PDA -> must fail (init guard)
//! - bump  : stored bump == canonical find_program_address bump
//! - ns    : risk_type == [0;32] (degenerate zero-hash) -> must fail
//!
//! Seeds (SPEC): `["subaccord", creator, risk_type]`. risk_type + evidence_spec
//! immutable; authority Pubkey::default() => immutable (ADR-0005).
//!
//! Run via `make test_unit`. One fresh `AnchorLiteSVM` context per test.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{DEFAULT_ALPHA_BPS, SEED_SUBACCORD};
use accord::state::Subaccord;
use accord::{accounts, instruction, ID};
use anchor_lang::AccountDeserialize;
use anchor_litesvm::AnchorLiteSVM;
use solana_program::pubkey::Pubkey;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::path::PathBuf;

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `cargo build-sbf` / `anchor build` first"))
}

/// Fresh context + a funded creator.
fn setup() -> (anchor_litesvm::AnchorContext, Keypair) {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = Keypair::new();
    svm.svm
        .airdrop(&creator.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    (svm, creator)
}

fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type.as_ref()], &ID).0
}

fn read_subaccord(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Subaccord {
    let acc = svm.svm.get_account(pda).expect("subaccord PDA exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// Canonical, non-zero identity hashes for tests.
fn sample_risk_type() -> [u8; 32] {
    [1u8; 32]
}
fn sample_evidence_spec() -> [u8; 32] {
    [2u8; 32]
}

fn build_ix(
    svm: &anchor_litesvm::AnchorContext,
    creator: &Pubkey,
    subaccord: &Pubkey,
    risk_type: [u8; 32],
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .accounts(accounts::CreateSubaccord {
            creator: *creator,
            subaccord: *subaccord,
            system_program: anchor_lang::system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: sample_evidence_spec(),
            staking_token: Pubkey::new_unique(),
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: 7 * 24 * 3600,
            commit_window: 2 * 24 * 3600,
            reveal_window: 2 * 24 * 3600,
            max_appeals: 3,
            fee_per_juror: 1_000_000,
            authority: Pubkey::default(),
            evidence_operator: Pubkey::new_unique(),
        })
        .instruction()
        .unwrap()
}

#[test]
fn happy_creates_subaccord_with_all_fields() {
    let (mut svm, creator) = setup();
    let risk_type = sample_risk_type();
    let staking_token = Pubkey::new_unique();
    let evidence_operator = Pubkey::new_unique();
    let pda = subaccord_pda(&creator.pubkey(), &risk_type);

    let ix = svm
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord: pda,
            system_program: anchor_lang::system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: sample_evidence_spec(),
            staking_token,
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: 7 * 24 * 3600,
            commit_window: 2 * 24 * 3600,
            reveal_window: 2 * 24 * 3600,
            max_appeals: 3,
            fee_per_juror: 1_000_000,
            authority: Pubkey::default(),
            evidence_operator,
        })
        .instruction()
        .unwrap();

    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    let s = read_subaccord(&svm, &pda);
    assert_eq!(s.creator, creator.pubkey());
    assert_eq!(s.staking_token, staking_token);
    assert_eq!(s.min_stake, 1_000);
    assert_eq!(s.jurors_per_dispute, 3);
    assert_eq!(s.alpha_bps, DEFAULT_ALPHA_BPS);
    assert_eq!(s.review_window, 7 * 24 * 3600);
    assert_eq!(s.commit_window, 2 * 24 * 3600);
    assert_eq!(s.reveal_window, 2 * 24 * 3600);
    assert_eq!(s.max_appeals, 3);
    assert_eq!(s.fee_per_juror, 1_000_000);
    assert_eq!(s.authority, Pubkey::default(), "default => immutable");
    assert_eq!(s.evidence_operator, evidence_operator);
    assert_eq!(s.risk_type, risk_type, "risk_type immutable identity");
    assert_eq!(s.evidence_spec, sample_evidence_spec());
    assert!(s.bump > 0);
}

#[test]
fn reinit_at_same_pda_fails() {
    let (mut svm, creator) = setup();
    let risk_type = sample_risk_type();
    let pda = subaccord_pda(&creator.pubkey(), &risk_type);
    let ix = build_ix(&svm, &creator.pubkey(), &pda, risk_type);

    svm.execute_instruction(ix.clone(), &[&creator])
        .unwrap()
        .assert_success();

    // second create at the SAME PDA (same creator + risk_type) must fail: init
    // guard prevents re-initialization / namespace capture.
    let r = svm.execute_instruction(ix, &[&creator]).unwrap();
    assert!(!r.is_success(), "re-init must fail; logs={:?}", r.logs());
}

#[test]
fn stores_canonical_bump() {
    let (mut svm, creator) = setup();
    let risk_type = sample_risk_type();
    let pda = subaccord_pda(&creator.pubkey(), &risk_type);
    let (_, canonical_bump) = Pubkey::find_program_address(
        &[
            SEED_SUBACCORD,
            creator.pubkey().as_ref(),
            risk_type.as_ref(),
        ],
        &ID,
    );

    let ix = build_ix(&svm, &creator.pubkey(), &pda, risk_type);
    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    let s = read_subaccord(&svm, &pda);
    assert_eq!(s.bump, canonical_bump);
}

#[test]
fn zero_risk_type_is_rejected() {
    let (mut svm, creator) = setup();
    let risk_type = [0u8; 32]; // degenerate zero-hash namespace
    let pda = subaccord_pda(&creator.pubkey(), &risk_type);
    let ix = build_ix(&svm, &creator.pubkey(), &pda, risk_type);

    let r = svm.execute_instruction(ix, &[&creator]).unwrap();
    assert!(
        !r.is_success(),
        "zero risk_type must be rejected; logs={:?}",
        r.logs()
    );
    assert!(svm.svm.get_account(&pda).is_none(), "no account created");
}

#[test]
fn same_creator_different_risk_type_distinct_pda() {
    let (mut svm, creator) = setup();
    let a = sample_risk_type();
    let b = [3u8; 32];
    let pda_a = subaccord_pda(&creator.pubkey(), &a);
    let pda_b = subaccord_pda(&creator.pubkey(), &b);
    assert_ne!(pda_a, pda_b, "different risk_type => different namespace");

    svm.execute_instruction(build_ix(&svm, &creator.pubkey(), &pda_a, a), &[&creator])
        .unwrap()
        .assert_success();
    svm.execute_instruction(build_ix(&svm, &creator.pubkey(), &pda_b, b), &[&creator])
        .unwrap()
        .assert_success();
    // both coexist
    assert!(svm.svm.get_account(&pda_a).is_some());
    assert!(svm.svm.get_account(&pda_b).is_some());
}
