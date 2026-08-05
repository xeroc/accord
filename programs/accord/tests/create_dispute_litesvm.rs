#![cfg(feature = "no-entrypoint")]
//! `create_dispute` tests (veridao-rrxs). LiteSVM exercises the Arbitrable CPI
//! entry: fee custody, the coarse `staker_count` intake gate, fee/options
//! validation, and the ADR-0007 pause.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy   : fee moves to vault + Dispute created with correct fields
//! - juror   : staker_count < jurors_per_dispute            -> must fail (InsufficientJurors)
//! - fee     : tendered fee != N*fee_per_juror              -> must fail (FeeMismatch)
//! - options : fewer than 2 options                         -> must fail (InvalidOptions)
//! - pause   : create while paused                          -> must fail
//!
//! Run via `make test_unit`.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{
    DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD,
};
use accord::state::{Dispute, DisputeState};
use accord::{accounts, instruction, ID};
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, AssertionHelpers, TestHelpers};
use solana_program::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::path::PathBuf;

const SYS: Pubkey = anchor_lang::system_program::ID;
const JURORS_PER_DISPUTE: u32 = 3;
const FEE_PER_JUROR: u64 = 1_000_000;
const REQUIRED_FEE: u64 = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `cargo build-sbf` / `anchor build` first"))
}

fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type.as_ref()], &ID).0
}
fn juror_stake_pda(subaccord: &Pubkey, juror: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_JUROR_STAKE, subaccord.as_ref(), juror.as_ref()], &ID).0
}
fn dispute_pda(filer: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(&[SEED_DISPUTE, filer.as_ref(), &nonce.to_le_bytes()], &ID).0
}
fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}
fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(subaccord, mint)
}
fn read_dispute(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Dispute {
    let acc = svm.svm.get_account(pda).expect("dispute PDA exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// Read an SPL token amount from a raw on-chain account. SPL token layout is
/// mint(32) + owner(32) + amount(8 @ offset 64) — read directly to avoid the
/// spl_token crate version churn in the test dep tree.
fn token_amount(svm: &anchor_litesvm::AnchorContext, ata: &Pubkey) -> u64 {
    let acc = svm.svm.get_account(ata).expect("token account exists");
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&acc.data[64..72]);
    u64::from_le_bytes(buf)
}

type Kp = solana_sdk::signature::Keypair;

/// Funded creator + subcord over `mint` + `n_stakers` distinct staked Jurors
/// (each stakes once, so staker_count == n_stakers) + a funded filer ATA.
struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    filer: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    filer_ata: Pubkey,
}

fn setup(n_stakers: usize) -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(50_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &subaccord, &mint, risk_type);

    // stake n_stakers distinct jurors (any amount > 0 bumps staker_count)
    for _ in 0..n_stakers {
        let juror = svm.svm.create_funded_account(50_000_000_000).unwrap();
        let juror_ata = svm
            .svm
            .create_associated_token_account(&mint, &juror)
            .unwrap();
        svm.svm
            .mint_to(&mint, &juror_ata, &creator, 10_000)
            .unwrap();
        stake(&mut svm, &juror, &subaccord, &mint, &juror_ata, 5_000);
    }

    let filer_ata = svm
        .svm
        .create_associated_token_account(&mint, &filer)
        .unwrap();
    svm.svm
        .mint_to(&mint, &filer_ata, &creator, REQUIRED_FEE * 10)
        .unwrap();

    Fixture {
        svm,
        creator,
        filer,
        mint,
        subaccord,
        filer_ata,
    }
}

fn init_pause(svm: &mut anchor_litesvm::AnchorContext, authority: &Kp) {
    let ix = svm
        .program()
        .accounts(accounts::InitializePause {
            authority: authority.pubkey(),
            pause_state: pause_pda(),
            system_program: SYS,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[authority])
        .unwrap()
        .assert_success();
}

fn create_subaccord(
    svm: &mut anchor_litesvm::AnchorContext,
    creator: &Kp,
    subaccord: &Pubkey,
    mint: &Pubkey,
    risk_type: [u8; 32],
) {
    let ix = svm
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord: *subaccord,
            system_program: SYS,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: [2u8; 32],
            staking_token: *mint,
            min_stake: 1_000,
            jurors_per_dispute: JURORS_PER_DISPUTE,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: 7 * 24 * 3600,
            commit_window: 2 * 24 * 3600,
            reveal_window: 2 * 24 * 3600,
            max_appeals: 3,
            fee_per_juror: FEE_PER_JUROR,
            authority: Pubkey::default(),
            evidence_operator: Pubkey::new_unique(),
        })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[creator])
        .unwrap()
        .assert_success();
}

fn stake(
    svm: &mut anchor_litesvm::AnchorContext,
    juror: &Kp,
    subaccord: &Pubkey,
    mint: &Pubkey,
    juror_ata: &Pubkey,
    amount: u64,
) {
    let juror_stake = juror_stake_pda(subaccord, &juror.pubkey());
    let vault = vault_ata(subaccord, mint);
    let ix = svm
        .program()
        .accounts(accounts::Stake {
            juror: juror.pubkey(),
            subaccord: *subaccord,
            pause_state: pause_pda(),
            juror_stake,
            staking_token: *mint,
            juror_token_account: *juror_ata,
            vault,
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
            system_program: SYS,
        })
        .args(instruction::Stake { amount })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[juror])
        .unwrap()
        .assert_success();
}

#[allow(clippy::too_many_arguments)]
fn create_dispute_ix(
    svm: &anchor_litesvm::AnchorContext,
    filer: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    mint: &Pubkey,
    filer_ata: &Pubkey,
    vault: &Pubkey,
    options: Vec<[u8; 32]>,
    evidence_hash: [u8; 32],
    nonce: u64,
    fee: u64,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .accounts(accounts::CreateDispute {
            filer: *filer,
            subaccord: *subaccord,
            pause_state: pause_pda(),
            dispute: *dispute,
            staking_token: *mint,
            filer_token_account: *filer_ata,
            vault: *vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::CreateDispute {
            options,
            evidence_hash,
            nonce,
            fee,
        })
        .instruction()
        .unwrap()
}

fn pause(svm: &mut anchor_litesvm::AnchorContext, authority: &Kp) {
    let ix = svm
        .program()
        .accounts(accounts::Pause {
            authority: authority.pubkey(),
            pause_state: pause_pda(),
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[authority])
        .unwrap()
        .assert_success();
}

#[test]
fn happy_creates_dispute_and_moves_fee() {
    let mut fx = setup(JURORS_PER_DISPUTE as usize);
    let nonce = 1u64;
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let options = vec![[1u8; 32], [2u8; 32]];
    let evidence = [7u8; 32];
    let vault_before = token_amount(&fx.svm, &vault);

    fx.svm
        .execute_instruction(
            create_dispute_ix(
                &fx.svm,
                &fx.filer.pubkey(),
                &fx.subaccord,
                &dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                options.clone(),
                evidence,
                nonce,
                REQUIRED_FEE,
            ),
            &[&fx.filer],
        )
        .unwrap()
        .assert_success();

    // fee custody: filer lost exactly REQUIRED_FEE, vault gained exactly it.
    fx.svm
        .svm
        .assert_token_balance(&fx.filer_ata, REQUIRED_FEE * 10 - REQUIRED_FEE);
    assert_eq!(
        token_amount(&fx.svm, &vault),
        vault_before + REQUIRED_FEE,
        "vault must increase by the fee"
    );

    let d = read_dispute(&fx.svm, &dispute);
    assert_eq!(d.subaccord, fx.subaccord);
    assert_eq!(d.filer, fx.filer.pubkey());
    assert_eq!(d.nonce, nonce);
    assert_eq!(d.num_options, 2);
    assert_eq!(d.options[0], [1u8; 32]);
    assert_eq!(d.options[1], [2u8; 32]);
    assert_eq!(d.evidence_hash, evidence);
    assert_eq!(d.state, DisputeState::Created);
    assert_eq!(d.current_round, 0);
    assert_eq!(d.final_ruling, u8::MAX);
    assert_eq!(d.fee_paid, REQUIRED_FEE);
    assert!(d.bump > 0);
}

#[test]
fn insufficient_jurors_reverts() {
    // only 2 stakers but the panel needs 3
    let mut fx = setup((JURORS_PER_DISPUTE - 1) as usize);
    let nonce = 1u64;
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let r = fx
        .svm
        .execute_instruction(
            create_dispute_ix(
                &fx.svm,
                &fx.filer.pubkey(),
                &fx.subaccord,
                &dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                vec![[1u8; 32], [2u8; 32]],
                [7u8; 32],
                nonce,
                REQUIRED_FEE,
            ),
            &[&fx.filer],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "create with too few stakers must revert (InsufficientJurors); logs={:?}",
        r.logs()
    );
    assert!(fx.svm.svm.get_account(&dispute).is_none(), "no Dispute");
    // fee not taken
    fx.svm
        .svm
        .assert_token_balance(&fx.filer_ata, REQUIRED_FEE * 10);
}

#[test]
fn fee_mismatch_reverts() {
    let mut fx = setup(JURORS_PER_DISPUTE as usize);
    let nonce = 1u64;
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let r = fx
        .svm
        .execute_instruction(
            create_dispute_ix(
                &fx.svm,
                &fx.filer.pubkey(),
                &fx.subaccord,
                &dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                vec![[1u8; 32], [2u8; 32]],
                [7u8; 32],
                nonce,
                REQUIRED_FEE - 1, // underpays
            ),
            &[&fx.filer],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "wrong fee must revert (FeeMismatch); logs={:?}",
        r.logs()
    );
    assert!(fx.svm.svm.get_account(&dispute).is_none());
}

#[test]
fn too_few_options_reverts() {
    let mut fx = setup(JURORS_PER_DISPUTE as usize);
    let nonce = 1u64;
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let r = fx
        .svm
        .execute_instruction(
            create_dispute_ix(
                &fx.svm,
                &fx.filer.pubkey(),
                &fx.subaccord,
                &dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                vec![[1u8; 32]], // only one option
                [7u8; 32],
                nonce,
                REQUIRED_FEE,
            ),
            &[&fx.filer],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "fewer than 2 options must revert (InvalidOptions); logs={:?}",
        r.logs()
    );
    assert!(fx.svm.svm.get_account(&dispute).is_none());
}

#[test]
fn pause_blocks_create_dispute() {
    let mut fx = setup(JURORS_PER_DISPUTE as usize);
    pause(&mut fx.svm, &fx.creator);
    let nonce = 1u64;
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let r = fx
        .svm
        .execute_instruction(
            create_dispute_ix(
                &fx.svm,
                &fx.filer.pubkey(),
                &fx.subaccord,
                &dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                vec![[1u8; 32], [2u8; 32]],
                [7u8; 32],
                nonce,
                REQUIRED_FEE,
            ),
            &[&fx.filer],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "create while paused must revert; logs={:?}",
        r.logs()
    );
    assert!(fx.svm.svm.get_account(&dispute).is_none());
}
