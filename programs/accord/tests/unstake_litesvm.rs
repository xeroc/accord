//! `unstake` tests (veridao-b2sc). LiteSVM exercises the PDA-signed SPL
//! withdrawal out of the Subaccord vault.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy   : unstake moves vault -> juror ATA + debits JurorStake.amount
//! - partial : partial withdraw leaves an exact integer remainder
//! - full    : withdrawing the whole balance zeroes JurorStake.amount
//! - over    : withdraw > stake              -> must fail (InsufficientBalance)
//! - locked  : withdraw while active_draws>0 -> must fail (StakeLocked)
//! - zero    : zero amount                   -> must fail (InvalidAmount)
//!
//! `unstake` is intentionally never paused (ADR-0007 traps no capital), so there
//! is no pause test here.
//!
//! Run via `make test_unit`.

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

const SYS: Pubkey = solana_program::system_program::ID;
const FUND: u64 = 1_000_000_000;
const STAKE_AMT: u64 = 5_000;

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

type Kp = solana_sdk::signature::Keypair;

struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    juror: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    juror_ata: Pubkey,
    vault: Pubkey,
    juror_stake: Pubkey,
}

/// Funded creator + juror, unpaused pause singleton, Subaccord over `mint`, and a
/// Juror who has already staked `STAKE_AMT` (vault + JurorStake exist).
fn setup() -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50 * 1_000_000_000).unwrap();
    let juror = svm.svm.create_funded_account(50 * 1_000_000_000).unwrap();

    // pause init (unstake ignores it, but stake requires the account present)
    let ix = svm
        .program()
        .request()
        .accounts(accounts::InitializePause {
            authority: creator.pubkey(),
            pause_state: pause_pda(),
            system_program: SYS,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);

    // create_subaccord
    let ix = svm
        .program()
        .request()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord,
            system_program: SYS,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: [2u8; 32],
            staking_token: mint,
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
    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    // fund juror ATA + stake
    let juror_ata = svm
        .svm
        .create_associated_token_account(&mint, &juror)
        .unwrap();
    svm.svm.mint_to(&mint, &juror_ata, &creator, FUND).unwrap();

    let juror_stake = juror_stake_pda(&subaccord, &juror.pubkey());
    let vault = vault_ata(&subaccord, &mint);
    let ix = svm
        .program()
        .request()
        .accounts(accounts::Stake {
            juror: juror.pubkey(),
            subaccord,
            pause_state: pause_pda(),
            juror_stake,
            staking_token: mint,
            juror_token_account: juror_ata,
            vault,
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
            system_program: SYS,
        })
        .args(instruction::Stake { amount: STAKE_AMT })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&juror])
        .unwrap()
        .assert_success();

    Fixture {
        svm,
        juror,
        mint,
        subaccord,
        juror_ata,
        vault,
        juror_stake,
    }
}

fn unstake_ix(
    svm: &anchor_litesvm::AnchorContext,
    fx: &Fixture,
    amount: u64,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .request()
        .accounts(accounts::Unstake {
            juror: fx.juror.pubkey(),
            subaccord: fx.subaccord,
            juror_stake: fx.juror_stake,
            staking_token: fx.mint,
            juror_token_account: fx.juror_ata,
            vault: fx.vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::Unstake { amount })
        .instruction()
        .unwrap()
}

/// Set `active_draws` on the on-chain JurorStake (draw lands in a later bean).
fn set_active_draws(svm: &mut anchor_litesvm::AnchorContext, pda: &Pubkey, n: u32) {
    let mut js = read_juror_stake(svm, pda);
    js.active_draws = n;
    let mut buf = Vec::new();
    js.try_serialize(&mut buf).unwrap();
    let mut acc = svm.svm.get_account(pda).unwrap();
    acc.data = buf;
    svm.svm.set_account(*pda, acc).unwrap();
}

#[test]
fn happy_unstake_moves_tokens_and_debits_amount() {
    let mut fx = setup();
    let juror_before = FUND - STAKE_AMT; // after the setup stake

    fx.svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, 2_000), &[&fx.juror])
        .unwrap()
        .assert_success();

    fx.svm
        .svm
        .assert_token_balance(&fx.vault, STAKE_AMT - 2_000);
    fx.svm
        .svm
        .assert_token_balance(&fx.juror_ata, juror_before + 2_000);
    assert_eq!(
        read_juror_stake(&fx.svm, &fx.juror_stake).amount,
        STAKE_AMT - 2_000
    );
}

#[test]
fn partial_withdraw_exact_remainder() {
    let mut fx = setup();
    fx.svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, 3_000), &[&fx.juror])
        .unwrap()
        .assert_success();
    let js = read_juror_stake(&fx.svm, &fx.juror_stake);
    assert_eq!(js.amount, 2_000, "exact integer remainder");
    fx.svm.svm.assert_token_balance(&fx.vault, 2_000);
    assert_eq!(js.active_draws, 0);
}

#[test]
fn full_withdraw_zeroes_balance() {
    let mut fx = setup();
    fx.svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, STAKE_AMT), &[&fx.juror])
        .unwrap()
        .assert_success();
    assert_eq!(read_juror_stake(&fx.svm, &fx.juror_stake).amount, 0);
    fx.svm.svm.assert_token_balance(&fx.vault, 0);
}

#[test]
fn over_withdraw_reverts() {
    let mut fx = setup();
    let r = fx
        .svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, STAKE_AMT + 1), &[&fx.juror])
        .unwrap();
    assert!(
        !r.is_success(),
        "over-withdraw must revert; logs={:?}",
        r.logs()
    );
    // balance untouched
    assert_eq!(read_juror_stake(&fx.svm, &fx.juror_stake).amount, STAKE_AMT);
    fx.svm.svm.assert_token_balance(&fx.vault, STAKE_AMT);
}

#[test]
fn blocked_while_drawn_reverts() {
    let mut fx = setup();
    set_active_draws(&mut fx.svm, &fx.juror_stake, 2);
    let r = fx
        .svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, 1_000), &[&fx.juror])
        .unwrap();
    assert!(
        !r.is_success(),
        "unstake while active_draws>0 must revert (StakeLocked); logs={:?}",
        r.logs()
    );
    // nothing moved
    assert_eq!(read_juror_stake(&fx.svm, &fx.juror_stake).amount, STAKE_AMT);
    fx.svm.svm.assert_token_balance(&fx.vault, STAKE_AMT);
}

#[test]
fn zero_amount_reverts() {
    let mut fx = setup();
    let r = fx
        .svm
        .execute_instruction(unstake_ix(&fx.svm, &fx, 0), &[&fx.juror])
        .unwrap();
    assert!(
        !r.is_success(),
        "zero amount must revert; logs={:?}",
        r.logs()
    );
}
