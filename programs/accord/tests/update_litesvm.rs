//! `propose_subaccord_update` / `execute_subaccord_update` tests (veridao-y63e).
//! LiteSVM exercises the ADR-0005 authority + 48h on-chain timelock, including
//! slot time travel.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy   : authority proposes -> PendingUpdate with execute_after_slot
//! - auth    : non-authority propose            -> must fail (Unauthorized)
//! - immut   : authority==default propose       -> must fail (ImmutableSubaccord)
//! - time    : execute before the deadline      -> must fail (TimelockNotElapsed)
//! - time    : execute after the deadline       -> applies the payload + closes
//!
//! Run via `make test_unit`.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{SEED_PENDING_UPDATE, SEED_SUBACCORD, UPDATE_TIMELOCK_SLOTS};
use accord::state::{PendingUpdate, Subaccord, UpdatePayload};
use accord::{accounts, instruction, ID};
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TestHelpers};
use solana_program::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use std::path::PathBuf;

const SYS: Pubkey = solana_program::system_program::ID;

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `cargo build-sbf` / `anchor build` first"))
}

fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type.as_ref()], &ID).0
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
fn read_pending(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> PendingUpdate {
    let acc = svm.svm.get_account(pda).expect("pending PDA exists");
    PendingUpdate::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_subaccord(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Subaccord {
    let acc = svm.svm.get_account(pda).expect("subaccord PDA exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

type Kp = solana_sdk::signature::Keypair;

/// Immutable Subaccord (authority == default). Returns (svm, creator, subaccord).
fn setup_immutable() -> (anchor_litesvm::AnchorContext, Kp, Pubkey) {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);

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
            staking_token: Pubkey::new_unique(),
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: 1_000,
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

    (svm, creator, subaccord)
}

/// Mutable Subaccord: returns (svm, creator, funded authority keypair, subaccord).
fn setup_mutable() -> (anchor_litesvm::AnchorContext, Kp, Kp, Pubkey, [u8; 32]) {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let authority = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);

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
            staking_token: Pubkey::new_unique(),
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: 1_000,
            review_window: 7 * 24 * 3600,
            commit_window: 2 * 24 * 3600,
            reveal_window: 2 * 24 * 3600,
            max_appeals: 3,
            fee_per_juror: 1_000_000,
            authority: authority.pubkey(),
            evidence_operator: Pubkey::new_unique(),
        })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    (svm, creator, authority, subaccord, risk_type)
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
        .request()
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
        .request()
        .accounts(accounts::ExecuteSubaccordUpdate {
            caller: *caller,
            subaccord: *subaccord,
            pending_update: *pending,
        })
        .args(instruction::ExecuteSubaccordUpdate {})
        .instruction()
        .unwrap()
}

#[test]
fn propose_creates_pending_update_with_timelock() {
    let (mut svm, _creator, authority, subaccord, _) = setup_mutable();
    let nonce = 1u64;
    let pending = pending_pda(&subaccord, nonce);
    let payload = UpdatePayload::MinStake(2_500);

    let slot = svm
        .svm
        .get_sysvar::<solana_program::sysvar::clock::Clock>()
        .slot;

    svm.execute_instruction(
        propose_ix(
            &svm,
            &authority.pubkey(),
            &subaccord,
            &pending,
            nonce,
            payload.clone(),
        ),
        &[&authority],
    )
    .unwrap()
    .assert_success();

    let pu = read_pending(&svm, &pending);
    assert_eq!(pu.subaccord, subaccord);
    assert_eq!(pu.nonce, nonce);
    assert_eq!(pu.proposed, payload);
    assert_eq!(pu.proposed_by, authority.pubkey());
    assert_eq!(
        pu.execute_after_slot,
        slot + UPDATE_TIMELOCK_SLOTS,
        "48h timelock from propose slot"
    );
    assert!(pu.bump > 0);
}

#[test]
fn unauthorized_propose_reverts() {
    let (mut svm, _creator, _authority, subaccord, _) = setup_mutable();
    let attacker = svm.svm.create_funded_account(1_000_000_000).unwrap();
    let nonce = 1u64;
    let pending = pending_pda(&subaccord, nonce);

    let r = svm
        .execute_instruction(
            propose_ix(
                &svm,
                &attacker.pubkey(),
                &subaccord,
                &pending,
                nonce,
                UpdatePayload::MinStake(2_500),
            ),
            &[&attacker],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "non-authority propose must revert (Unauthorized); logs={:?}",
        r.logs()
    );
    assert!(svm.svm.get_account(&pending).is_none(), "no PendingUpdate");
}

#[test]
fn immutable_subaccord_propose_reverts() {
    let (mut svm, _creator, subaccord) = setup_immutable();
    let nonce = 1u64;
    let pending = pending_pda(&subaccord, nonce);
    // any funded signer attempts to propose on an immutable Subaccord
    let someone = svm.svm.create_funded_account(1_000_000_000).unwrap();

    let r = svm
        .execute_instruction(
            propose_ix(
                &svm,
                &someone.pubkey(),
                &subaccord,
                &pending,
                nonce,
                UpdatePayload::MinStake(2_500),
            ),
            &[&someone],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "propose on immutable Subaccord must revert; logs={:?}",
        r.logs()
    );
    assert!(svm.svm.get_account(&pending).is_none());
}

#[test]
fn execute_before_deadline_reverts() {
    let (mut svm, _creator, authority, subaccord, _) = setup_mutable();
    let nonce = 1u64;
    let pending = pending_pda(&subaccord, nonce);
    svm.execute_instruction(
        propose_ix(
            &svm,
            &authority.pubkey(),
            &subaccord,
            &pending,
            nonce,
            UpdatePayload::MinStake(2_500),
        ),
        &[&authority],
    )
    .unwrap()
    .assert_success();

    let cranker = svm.svm.create_funded_account(1_000_000_000).unwrap();
    let r = svm
        .execute_instruction(
            execute_ix(&svm, &cranker.pubkey(), &subaccord, &pending),
            &[&cranker],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "execute before the deadline must revert (TimelockNotElapsed); logs={:?}",
        r.logs()
    );
    // subaccord unchanged
    assert_eq!(read_subaccord(&svm, &subaccord).min_stake, 1_000);
    // pending still open
    assert!(svm.svm.get_account(&pending).is_some());
}

#[test]
fn execute_after_deadline_applies_and_closes() {
    let (mut svm, _creator, authority, subaccord, _) = setup_mutable();
    let nonce = 7u64;
    let pending = pending_pda(&subaccord, nonce);
    svm.execute_instruction(
        propose_ix(
            &svm,
            &authority.pubkey(),
            &subaccord,
            &pending,
            nonce,
            UpdatePayload::MinStake(9_999),
        ),
        &[&authority],
    )
    .unwrap()
    .assert_success();

    let deadline = read_pending(&svm, &pending).execute_after_slot;
    svm.svm.warp_to_slot(deadline + 1); // time travel past the 48h notice

    let cranker = svm.svm.create_funded_account(1_000_000_000).unwrap();
    svm.execute_instruction(
        execute_ix(&svm, &cranker.pubkey(), &subaccord, &pending),
        &[&cranker],
    )
    .unwrap()
    .assert_success();

    // payload applied
    assert_eq!(read_subaccord(&svm, &subaccord).min_stake, 9_999);
    // PendingUpdate closed (rent refunded). LiteSVM keeps the zeroed entry
    // rather than removing it, so check for 0 lamports / emptied data.
    match svm.svm.get_account(&pending) {
        None => {}
        Some(acc) => {
            assert_eq!(
                acc.lamports, 0,
                "PendingUpdate lamports must be drained on close"
            );
            assert!(
                acc.data.is_empty(),
                "PendingUpdate data must be zeroed on close"
            );
        }
    }
}
