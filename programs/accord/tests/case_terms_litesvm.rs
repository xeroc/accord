#![cfg(feature = "no-entrypoint")]
//! `CaseTerms` freeze tests (bean accord-4e7p / CONCEPT-REVIEW Ugly 6).
//!
//! Proves the arbitration-contract invariant: a dispute's economically
//! load-bearing params are **frozen at filing time**. A 48h-timelocked
//! governance change (ADR-0005) cannot retroactively shift slashing severity,
//! fees, panel sizes, or windows on an active case — only on disputes filed
//! after the change lands.
//!
//! Coverage:
//! - snapshot: `dispute.terms` == filing-time Subaccord values (all 8 fields)
//! - freeze  : propose + execute a timelocked `alpha_bps` change mid-dispute;
//!             `dispute.terms.alpha_bps` stays at the filing-time value while
//!             `sub.alpha_bps` takes the new value
//! - new-case : a second dispute filed AFTER the change snapshots the NEW value
//!
//! The downstream read path (`finalize_dispute` reads `dispute.terms.alpha_bps`
//! for the slash, etc.) is structurally guaranteed by the code change; the
//! existing `voting_litesvm`/`appeal_litesvm` suites guard the happy path.
//!
//! Run via `make test_unit`.

use accord::constants::{
    DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_PENDING_UPDATE,
    SEED_SUBACCORD,
};
use accord::state::{Dispute, Subaccord, UpdatePayload};
use accord::{accounts, instruction, ID};
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TestHelpers};
use solana_program::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::path::PathBuf;

const SYS: Pubkey = anchor_lang::system_program::ID;
const JURORS_PER_DISPUTE: u32 = 3;
const FEE_PER_JUROR: u64 = 1_000_000;
const REQUIRED_FEE: u64 = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
const MIN_STAKE: u64 = 1_000;
const REVIEW_WINDOW: u64 = 7 * 24 * 3600;
const COMMIT_WINDOW: u64 = 2 * 24 * 3600;
const REVEAL_WINDOW: u64 = 2 * 24 * 3600;
const MAX_APPEALS: u8 = 3;
const NEW_ALPHA_BPS: u16 = DEFAULT_ALPHA_BPS + 500; // 10% -> 15%

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
fn pending_pda(subaccord: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            SEED_PENDING_UPDATE,
            subaccord.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &ID,
    )
    .0
}
fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(subaccord, mint)
}
fn read_dispute(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Dispute {
    let acc = svm.svm.get_account(pda).expect("dispute PDA exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_subaccord(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Subaccord {
    let acc = svm.svm.get_account(pda).expect("subaccord PDA exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

type Kp = solana_sdk::signature::Keypair;

struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    authority: Kp,
    filer: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    filer_ata: Pubkey,
}

/// Mutable Subaccord (authority set so governance can propose/execute) + 3
/// staked jurors (passes the `staker_count >= jurors_per_dispute` gate) + a
/// funded filer ATA (enough for two dispute fees).
fn setup() -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let authority = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(50_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &authority, &subaccord, &mint, risk_type);

    for _ in 0..JURORS_PER_DISPUTE {
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
        authority,
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
    authority: &Kp,
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
            min_stake: MIN_STAKE,
            jurors_per_dispute: JURORS_PER_DISPUTE,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: REVIEW_WINDOW,
            commit_window: COMMIT_WINDOW,
            reveal_window: REVEAL_WINDOW,
            max_appeals: MAX_APPEALS,
            fee_per_juror: FEE_PER_JUROR,
            authority: authority.pubkey(),
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
    nonce: u64,
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
            options: vec![[1u8; 32], [2u8; 32]],
            evidence_hash: [7u8; 32],
            nonce,
            fee: REQUIRED_FEE,
        })
        .instruction()
        .unwrap()
}

fn propose_ix(
    svm: &anchor_litesvm::AnchorContext,
    authority: &Pubkey,
    subaccord: &Pubkey,
    pending: &Pubkey,
    nonce: u64,
    payload: UpdatePayload,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .accounts(accounts::ProposeSubaccordUpdate {
            authority: *authority,
            subaccord: *subaccord,
            pending_update: *pending,
            system_program: SYS,
        })
        .args(instruction::ProposeSubaccordUpdate { nonce, payload })
        .instruction()
        .unwrap()
}

fn execute_ix(
    svm: &anchor_litesvm::AnchorContext,
    caller: &Pubkey,
    subaccord: &Pubkey,
    pending: &Pubkey,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .accounts(accounts::ExecuteSubaccordUpdate {
            caller: *caller,
            subaccord: *subaccord,
            pending_update: *pending,
        })
        .args(instruction::ExecuteSubaccordUpdate {})
        .instruction()
        .unwrap()
}

fn file_dispute(fx: &mut Fixture, nonce: u64) -> Pubkey {
    let dispute = dispute_pda(&fx.filer.pubkey(), nonce);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
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
                nonce,
            ),
            &[&fx.filer],
        )
        .unwrap()
        .assert_success();
    dispute
}

/// Land a timelocked AlphaBps update: propose, warp past the 48h notice slot,
/// then execute. After this, `sub.alpha_bps == NEW_ALPHA_BPS`.
fn land_alpha_update(fx: &mut Fixture, update_nonce: u64) {
    let pending = pending_pda(&fx.subaccord, update_nonce);
    fx.svm
        .execute_instruction(
            propose_ix(
                &fx.svm,
                &fx.authority.pubkey(),
                &fx.subaccord,
                &pending,
                update_nonce,
                UpdatePayload::AlphaBps(NEW_ALPHA_BPS),
            ),
            &[&fx.authority],
        )
        .unwrap()
        .assert_success();

    // Read the execute_after_slot from the typed PendingUpdate, then time-travel.
    let pu_acc = fx.svm.svm.get_account(&pending).expect("pending exists");
    let pu = accord::state::PendingUpdate::try_deserialize(&mut &pu_acc.data[..]).unwrap();
    fx.svm.svm.warp_to_slot(pu.execute_after_slot + 1);

    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    fx.svm
        .execute_instruction(
            execute_ix(&fx.svm, &cranker.pubkey(), &fx.subaccord, &pending),
            &[&cranker],
        )
        .unwrap()
        .assert_success();
}

#[test]
fn terms_snapshot_filing_time_values() {
    let mut fx = setup();
    let dispute = file_dispute(&mut fx, 1);

    let d = read_dispute(&fx.svm, &dispute);
    assert_eq!(d.terms.alpha_bps, DEFAULT_ALPHA_BPS);
    assert_eq!(d.terms.min_stake, MIN_STAKE);
    assert_eq!(d.terms.fee_per_juror, FEE_PER_JUROR);
    assert_eq!(d.terms.jurors_per_dispute, JURORS_PER_DISPUTE);
    assert_eq!(d.terms.review_window, REVIEW_WINDOW);
    assert_eq!(d.terms.commit_window, COMMIT_WINDOW);
    assert_eq!(d.terms.reveal_window, REVEAL_WINDOW);
    assert_eq!(d.terms.max_appeals, MAX_APPEALS);
}

#[test]
fn governance_change_does_not_mutate_active_dispute_terms() {
    let mut fx = setup();
    let dispute = file_dispute(&mut fx, 1);

    // Snapshot the filing-time alpha for the assertion.
    let filing_alpha = read_dispute(&fx.svm, &dispute).terms.alpha_bps;
    assert_eq!(filing_alpha, DEFAULT_ALPHA_BPS);

    // Mid-dispute: governance bumps alpha 10% -> 15% via the 48h timelock.
    land_alpha_update(&mut fx, 1);

    // The live Subaccord took the new value...
    assert_eq!(
        read_subaccord(&fx.svm, &fx.subaccord).alpha_bps,
        NEW_ALPHA_BPS,
        "governance change must land on the live Subaccord"
    );
    // ...but the active dispute's terms are frozen at the filing-time value.
    assert_eq!(
        read_dispute(&fx.svm, &dispute).terms.alpha_bps,
        DEFAULT_ALPHA_BPS,
        "active dispute terms must be immune to mid-case governance changes (Ugly 6)"
    );
    assert_ne!(
        read_dispute(&fx.svm, &dispute).terms.alpha_bps,
        read_subaccord(&fx.svm, &fx.subaccord).alpha_bps,
        "filing-time alpha != live alpha after the governance change"
    );
}

#[test]
fn new_dispute_after_change_snapshots_new_value() {
    let mut fx = setup();
    let _first = file_dispute(&mut fx, 1);

    land_alpha_update(&mut fx, 1);
    assert_eq!(
        read_subaccord(&fx.svm, &fx.subaccord).alpha_bps,
        NEW_ALPHA_BPS
    );

    // A second dispute, filed AFTER the change, snapshots the NEW alpha.
    let second = file_dispute(&mut fx, 2);
    assert_eq!(
        read_dispute(&fx.svm, &second).terms.alpha_bps,
        NEW_ALPHA_BPS,
        "governance changes must reach disputes filed after they land"
    );
    // And the first dispute is still frozen at the old alpha.
    assert_eq!(
        read_dispute(&fx.svm, &_first).terms.alpha_bps,
        DEFAULT_ALPHA_BPS
    );
}
