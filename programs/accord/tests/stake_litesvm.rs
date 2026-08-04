#![cfg(feature = "no-entrypoint")]
//! `stake` tests (veridao-ja2w). LiteSVM exercises the SPL-transfer staking
//! flow end-to-end against the bundled spl-token + spl-associated-token-account
//! programs (auto-loaded by LiteSVM::new()).
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy  : stake moves tokens into the vault + credits JurorStake.amount
//! - accum  : top-up accumulates; active_draws preserved (init_if_needed top-up)
//! - mint   : wrong staking_token mint                -> must fail
//! - vault  : vault not the Subaccord PDA's ATA       -> must fail (address)
//! - pause  : stake while paused                       -> must fail
//! - amount : zero amount                              -> must fail
//!
//! Run via `make test_unit`. One fresh `AnchorLiteSVM` context per test.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{DEFAULT_ALPHA_BPS, SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD};
use accord::state::JurorStake;
use accord::{accounts, instruction, ID};
use anchor_lang::{AccountDeserialize, AccountSerialize};
use anchor_litesvm::{AnchorLiteSVM, AssertionHelpers, TestHelpers};
use solana_program::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::path::PathBuf;

const SYS: Pubkey = anchor_lang::system_program::ID;
const STAKE_AMOUNT_FUND: u64 = 1_000_000_000;

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
fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}
fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(subaccord, mint)
}

fn read_juror_stake(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> JurorStake {
    let acc = svm.svm.get_account(pda).expect("juror_stake PDA exists");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// One-stop fixture: funded creator + funded juror + unpaused pause singleton +
/// a Subaccord over `mint` + a funded Juror ATA.
struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    creator: solana_sdk::signature::Keypair,
    juror: solana_sdk::signature::Keypair,
    mint: Pubkey,
    subaccord: Pubkey,
    juror_ata: Pubkey,
}

fn setup() -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50 * 1_000_000_000).unwrap();
    let juror = svm.svm.create_funded_account(50 * 1_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &subaccord, &mint, risk_type);

    let juror_ata = svm
        .svm
        .create_associated_token_account(&mint, &juror)
        .unwrap();
    svm.svm
        .mint_to(&mint, &juror_ata, &creator, STAKE_AMOUNT_FUND)
        .unwrap();

    Fixture {
        svm,
        creator,
        juror,
        mint,
        subaccord,
        juror_ata,
    }
}

fn init_pause(svm: &mut anchor_litesvm::AnchorContext, authority: &solana_sdk::signature::Keypair) {
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
    creator: &solana_sdk::signature::Keypair,
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
        .unwrap();
    svm.execute_instruction(ix, &[creator])
        .unwrap()
        .assert_success();
}

#[allow(clippy::too_many_arguments)]
fn stake_ix(
    svm: &anchor_litesvm::AnchorContext,
    juror: &Pubkey,
    subaccord: &Pubkey,
    juror_stake: &Pubkey,
    staking_token: &Pubkey,
    juror_ata: &Pubkey,
    vault: &Pubkey,
    amount: u64,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .accounts(accounts::Stake {
            juror: *juror,
            subaccord: *subaccord,
            pause_state: pause_pda(),
            juror_stake: *juror_stake,
            staking_token: *staking_token,
            juror_token_account: *juror_ata,
            vault: *vault,
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
            system_program: SYS,
        })
        .args(instruction::Stake { amount })
        .instruction()
        .unwrap()
}

fn pause(svm: &mut anchor_litesvm::AnchorContext, authority: &solana_sdk::signature::Keypair) {
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
fn happy_stake_moves_tokens_and_credits_amount() {
    let mut fx = setup();
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let ix = stake_ix(
        &fx.svm,
        &fx.juror.pubkey(),
        &fx.subaccord,
        &juror_stake,
        &fx.mint,
        &fx.juror_ata,
        &vault,
        5_000,
    );
    fx.svm
        .execute_instruction(ix, &[&fx.juror])
        .unwrap()
        .assert_success();

    fx.svm.svm.assert_token_balance(&vault, 5_000);
    fx.svm
        .svm
        .assert_token_balance(&fx.juror_ata, STAKE_AMOUNT_FUND - 5_000);

    let js = read_juror_stake(&fx.svm, &juror_stake);
    assert_eq!(js.amount, 5_000);
    assert_eq!(js.subaccord, fx.subaccord);
    assert_eq!(js.juror, fx.juror.pubkey());
    assert_eq!(js.active_draws, 0);
    assert!(js.bump > 0);
}

#[test]
fn top_up_accumulates_and_preserves_active_draws() {
    let mut fx = setup();
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    // first stake
    fx.svm
        .execute_instruction(
            stake_ix(
                &fx.svm,
                &fx.juror.pubkey(),
                &fx.subaccord,
                &juror_stake,
                &fx.mint,
                &fx.juror_ata,
                &vault,
                3_000,
            ),
            &[&fx.juror],
        )
        .unwrap()
        .assert_success();
    assert_eq!(read_juror_stake(&fx.svm, &juror_stake).amount, 3_000);

    // simulate the juror being drawn into a dispute (draw lands in a later bean)
    // by mutating active_draws on-chain — proves `stake` never resets it.
    {
        let mut js = read_juror_stake(&fx.svm, &juror_stake);
        js.active_draws = 2;
        let mut buf = Vec::new();
        js.try_serialize(&mut buf).unwrap();
        let mut acc = fx.svm.svm.get_account(&juror_stake).unwrap();
        acc.data = buf;
        fx.svm.svm.set_account(juror_stake, acc).unwrap();
    }

    // top-up
    fx.svm
        .execute_instruction(
            stake_ix(
                &fx.svm,
                &fx.juror.pubkey(),
                &fx.subaccord,
                &juror_stake,
                &fx.mint,
                &fx.juror_ata,
                &vault,
                2_000,
            ),
            &[&fx.juror],
        )
        .unwrap()
        .assert_success();

    let js = read_juror_stake(&fx.svm, &juror_stake);
    assert_eq!(js.amount, 5_000, "top-up must accumulate");
    assert_eq!(js.active_draws, 2, "active_draws must survive a top-up");
    fx.svm.svm.assert_token_balance(&vault, 5_000);
}

#[test]
fn wrong_mint_reverts() {
    let fx = setup();
    let mut svm = fx.svm;
    let bad_mint = svm.svm.create_token_mint(&fx.creator, 6).unwrap().pubkey();
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    let vault = vault_ata(&fx.subaccord, &bad_mint);

    let ix = stake_ix(
        &svm,
        &fx.juror.pubkey(),
        &fx.subaccord,
        &juror_stake,
        &bad_mint,
        &fx.juror_ata,
        &vault,
        1_000,
    );
    let r = svm.execute_instruction(ix, &[&fx.juror]).unwrap();
    assert!(
        !r.is_success(),
        "wrong mint must revert; logs={:?}",
        r.logs()
    );
    assert!(svm.svm.get_account(&juror_stake).is_none(), "no JurorStake");
}

#[test]
fn wrong_vault_owner_reverts() {
    let fx = setup();
    let mut svm = fx.svm;
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    // pass the JUROR's own ATA as the vault — its wallet is the juror, not the
    // Subaccord PDA, so `associated_token::authority = subaccord` must reject it.
    let ix = stake_ix(
        &svm,
        &fx.juror.pubkey(),
        &fx.subaccord,
        &juror_stake,
        &fx.mint,
        &fx.juror_ata,
        &fx.juror_ata, // wrong vault
        1_000,
    );
    let r = svm.execute_instruction(ix, &[&fx.juror]).unwrap();
    assert!(
        !r.is_success(),
        "wrong vault owner must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn pause_blocks_stake() {
    let mut fx = setup();
    pause(&mut fx.svm, &fx.creator);
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let ix = stake_ix(
        &fx.svm,
        &fx.juror.pubkey(),
        &fx.subaccord,
        &juror_stake,
        &fx.mint,
        &fx.juror_ata,
        &vault,
        1_000,
    );
    let r = fx.svm.execute_instruction(ix, &[&fx.juror]).unwrap();
    assert!(
        !r.is_success(),
        "stake while paused must revert; logs={:?}",
        r.logs()
    );
    assert!(
        fx.svm.svm.get_account(&juror_stake).is_none(),
        "no JurorStake created while paused"
    );
}

#[test]
fn zero_amount_reverts() {
    let fx = setup();
    let mut svm = fx.svm;
    let juror_stake = juror_stake_pda(&fx.subaccord, &fx.juror.pubkey());
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    let ix = stake_ix(
        &svm,
        &fx.juror.pubkey(),
        &fx.subaccord,
        &juror_stake,
        &fx.mint,
        &fx.juror_ata,
        &vault,
        0,
    );
    let r = svm.execute_instruction(ix, &[&fx.juror]).unwrap();
    assert!(
        !r.is_success(),
        "zero amount must revert; logs={:?}",
        r.logs()
    );
}
