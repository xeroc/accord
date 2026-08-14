#![cfg(feature = "no-entrypoint")]
//! Circuit-breaker tests (veridao-63v3). LiteSVM exercises the full pause /
//! unpause flow end-to-end including the on-chain slot timelock.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy : initialize -> pause -> propose_unpause -> warp -> execute_unpause
//! - auth  : non-authority pause             -> must fail
//! - state : double pause                    -> must fail (AlreadyPaused)
//! - state : propose_unpause while unpaused  -> must fail (NotPaused)
//! - time  : execute_unpause before notice   -> must fail (UnpauseTimelockNotElapsed)
//!
//! execute_unpause is permissionless, so it has no auth-fail case.
//!
//! Run via `make test_unit`. One fresh `AnchorLiteSVM` context per test.

#![cfg(feature = "no-entrypoint")]

use accord::constants::UNPAUSE_TIMELOCK_SLOTS;
use accord::state::AccordState;
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
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

fn pause_pda() -> Pubkey {
    accord::accord_state_pda().0
}

/// Fresh context + a funded authority + a funded attacker.
fn setup() -> (anchor_litesvm::AnchorContext, Keypair, Keypair) {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let authority = Keypair::new();
    let attacker = Keypair::new();
    svm.svm
        .airdrop(&authority.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    svm.svm
        .airdrop(&attacker.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    (svm, authority, attacker)
}

fn read_pause(svm: &anchor_litesvm::AnchorContext) -> AccordState {
    let acc = svm.svm.get_account(&pause_pda()).expect("pause PDA exists");
    AccordState::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// Init the singleton with `authority` as the pause authority. Returns a ready ctx.
fn init(svm: &mut anchor_litesvm::AnchorContext, authority: &Keypair) {
    let ix = svm
        .program()
        .accounts(accounts::InitializePause {
            authority: authority.pubkey(),
            accord_state: pause_pda(),
            system_program: anchor_lang::system_program::ID,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[authority])
        .unwrap()
        .assert_success();
}

#[test]
fn full_pause_unpause_flow() {
    let (mut svm, authority, _) = setup();
    let pda = pause_pda();
    init(&mut svm, &authority);
    assert!(!read_pause(&svm).paused);

    // pause: instant
    let ix = svm
        .program()
        .accounts(accounts::Pause {
            authority: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();
    svm.svm.expire_blockhash();
    assert!(read_pause(&svm).paused);

    // propose_unpause: arms the timelock at current_slot + UNPAUSE_TIMELOCK_SLOTS
    let slot = svm
        .svm
        .get_sysvar::<solana_program::sysvar::clock::Clock>()
        .slot;
    let ix = svm
        .program()
        .accounts(accounts::ProposeUnpause {
            authority: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::ProposeUnpause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();
    svm.svm.expire_blockhash();
    assert_eq!(
        read_pause(&svm).pending_unpause_after,
        Some(slot + UNPAUSE_TIMELOCK_SLOTS)
    );

    // execute_unpause BEFORE the notice slot: must fail
    let ix = svm
        .program()
        .accounts(accounts::ExecuteUnpause {
            caller: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::ExecuteUnpause {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[&authority]).unwrap();
    assert!(
        !r.is_success(),
        "execute_unpause must fail before the timelock; logs={:?}",
        r.logs()
    );
    svm.svm.expire_blockhash();

    // warp past the notice slot, then execute_unpause succeeds
    svm.svm.warp_to_slot(slot + UNPAUSE_TIMELOCK_SLOTS + 1);
    let ix = svm
        .program()
        .accounts(accounts::ExecuteUnpause {
            caller: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::ExecuteUnpause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();
    let s = read_pause(&svm);
    assert!(!s.paused);
    assert_eq!(s.pending_unpause_after, None);
}

#[test]
fn non_authority_cannot_pause() {
    let (mut svm, authority, attacker) = setup();
    let pda = pause_pda();
    init(&mut svm, &authority);

    let ix = svm
        .program()
        .accounts(accounts::Pause {
            authority: attacker.pubkey(),
            accord_state: pda,
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[&attacker]).unwrap();
    assert!(
        !r.is_success(),
        "non-authority pause must fail; logs={:?}",
        r.logs()
    );
    assert!(!read_pause(&svm).paused, "paused flag must not flip");
}

#[test]
fn double_pause_fails() {
    let (mut svm, authority, _) = setup();
    let pda = pause_pda();
    init(&mut svm, &authority);

    let ix = svm
        .program()
        .accounts(accounts::Pause {
            authority: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix.clone(), &[&authority])
        .unwrap()
        .assert_success();

    let r = svm.execute_instruction(ix, &[&authority]).unwrap();
    assert!(!r.is_success(), "double pause must fail (AlreadyPaused)");
}

#[test]
fn propose_unpause_while_unpaused_fails() {
    let (mut svm, authority, _) = setup();
    let pda = pause_pda();
    init(&mut svm, &authority);

    let ix = svm
        .program()
        .accounts(accounts::ProposeUnpause {
            authority: authority.pubkey(),
            accord_state: pda,
        })
        .args(instruction::ProposeUnpause {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[&authority]).unwrap();
    assert!(
        !r.is_success(),
        "propose_unpause while unpaused must fail (NotPaused); logs={:?}",
        r.logs()
    );
}
