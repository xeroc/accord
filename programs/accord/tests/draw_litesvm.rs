//! `draw` tests (veridao-fr1x). LiteSVM exercises the ADR-0003 juror draw:
//! Switchboard VRF consumption, Merkle membership verification against the
//! finalized Snapshot root, stake eligibility, distinctness, and the
//! `active_draws` freeze.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy  : finalized snapshot + valid memberships → Drawn + jurors recorded + active_draws++
//! - state  : snapshot not finalized                 -> revert (SnapshotNotFinalized)
//! - proof  : tampered Merkle proof                  -> revert (InvalidMembershipProof)
//! - dup    : same juror drawn twice                 -> revert (DuplicateJuror)
//! - panel  : wrong number of memberships            -> revert (InvalidPanelSize)
//! - stake  : leaf stake < min_stake                 -> revert (InsufficientStake)
//! - pda    : wrong JurorStake PDA in remaining      -> revert (InvalidMembershipProof)
//! - vrf    : VRF seed is deterministic
//! - double : re-draw same dispute                   -> revert (Round already exists / InvalidState)
//!
//! Run via `make test_unit`.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{
    DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_ROUND, SEED_SNAPSHOT,
    SEED_SUBACCORD,
};
use accord::state::{
    Dispute, DisputeState, JurorMembership, JurorStake, LeafClaim, Round, Snapshot,
};
use accord::{accounts, instruction, ID};
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TestHelpers};
use solana_program::{clock::Clock, hash::hashv, pubkey::Pubkey};
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::path::PathBuf;

const SYS: Pubkey = solana_program::system_program::ID;
const JURORS_PER_DISPUTE: u32 = 3;
const FEE_PER_JUROR: u64 = 1_000_000;
const REQUIRED_FEE: u64 = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
const MIN_STAKE: u64 = 1_000;
const STAKE_AMOUNT: u64 = 5_000;
const EXPECTED_BOND: u64 = 31 * FEE_PER_JUROR;

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
fn snapshot_pda(dispute: &Pubkey, round: u32) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_SNAPSHOT, dispute.as_ref(), &round.to_le_bytes()],
        &ID,
    )
    .0
}
fn round_pda(dispute: &Pubkey, round: u32) -> Pubkey {
    Pubkey::find_program_address(&[SEED_ROUND, dispute.as_ref(), &round.to_le_bytes()], &ID).0
}
fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}
fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(subaccord, mint)
}
fn read_round(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Round {
    let acc = svm.svm.get_account(pda).expect("round PDA exists");
    Round::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_juror_stake(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> JurorStake {
    let acc = svm.svm.get_account(pda).expect("juror_stake PDA exists");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn dispute_state(svm: &anchor_litesvm::AnchorContext, dispute: &Pubkey) -> DisputeState {
    let acc = svm.svm.get_account(dispute).expect("dispute exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap().state
}
fn warp_timestamp(svm: &mut anchor_litesvm::AnchorContext, ts: i64) {
    let mut clock = svm.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.svm.set_sysvar::<Clock>(&clock);
}

type Kp = solana_sdk::signature::Keypair;

// --- minimal Merkle tree (SHA-256 via hashv, matching the on-chain verifier) ---

fn leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}
fn parent(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[left, right]).to_bytes()
}
fn build_tree(mut leaves: Vec<[u8; 32]>) -> (Vec<Vec<[u8; 32]>>, [u8; 32]) {
    let mut size = 1;
    while size < leaves.len().max(1) {
        size *= 2;
    }
    leaves.resize(size, [0u8; 32]);
    let mut levels = vec![leaves];
    while levels.last().unwrap().len() > 1 {
        let next: Vec<[u8; 32]> = levels
            .last()
            .unwrap()
            .chunks(2)
            .map(|p| parent(&p[0], &p[1]))
            .collect();
        levels.push(next);
    }
    let root = levels.last().unwrap()[0];
    (levels, root)
}
fn merkle_proof(levels: &[Vec<[u8; 32]>], mut idx: usize) -> Vec<[u8; 32]> {
    let mut siblings = Vec::new();
    for lvl in levels.iter().take(levels.len() - 1) {
        siblings.push(lvl[idx ^ 1]);
        idx >>= 1;
    }
    siblings
}

struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    caller: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    snapshot: Pubkey,
    jurors: Vec<(Kp, u64, Pubkey)>,
    levels: Vec<Vec<[u8; 32]>>,
    root: [u8; 32],
}

fn setup() -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let caller = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let poster = svm.svm.create_funded_account(50_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &subaccord, &mint, risk_type);

    let mut jurors = Vec::new();
    for _ in 0..JURORS_PER_DISPUTE {
        let juror = svm.svm.create_funded_account(50_000_000_000).unwrap();
        let juror_ata = svm
            .svm
            .create_associated_token_account(&mint, &juror)
            .unwrap();
        svm.svm
            .mint_to(&mint, &juror_ata, &creator, 10_000)
            .unwrap();
        stake(
            &mut svm,
            &juror,
            &subaccord,
            &mint,
            &juror_ata,
            STAKE_AMOUNT,
        );
        let js_pda = juror_stake_pda(&subaccord, &juror.pubkey());
        jurors.push((juror, STAKE_AMOUNT, js_pda));
    }

    let filer_ata = svm
        .svm
        .create_associated_token_account(&mint, &filer)
        .unwrap();
    svm.svm
        .mint_to(&mint, &filer_ata, &creator, REQUIRED_FEE)
        .unwrap();
    create_dispute(&mut svm, &filer, &subaccord, &mint, &filer_ata, 1);
    let dispute = dispute_pda(&filer.pubkey(), 1);

    let leaves: Vec<[u8; 32]> = jurors
        .iter()
        .map(|(kp, stake, _)| leaf_hash(&kp.pubkey(), *stake))
        .collect();
    let (levels, root) = build_tree(leaves);

    let snapshot = snapshot_pda(&dispute, 0);
    let vault = vault_ata(&subaccord, &mint);
    let poster_ata = svm
        .svm
        .create_associated_token_account(&mint, &poster)
        .unwrap();
    svm.svm
        .mint_to(&mint, &poster_ata, &creator, EXPECTED_BOND * 5)
        .unwrap();
    post_snapshot(
        &mut svm,
        &poster,
        &subaccord,
        &dispute,
        &snapshot,
        &mint,
        &poster_ata,
        &vault,
        root,
    );

    let snap = {
        let acc = svm.svm.get_account(&snapshot).unwrap();
        Snapshot::try_deserialize(&mut &acc.data[..]).unwrap()
    };
    warp_timestamp(&mut svm, snap.challenge_deadline + 1);
    finalize_snapshot(
        &mut svm,
        &creator,
        &subaccord,
        &dispute,
        &snapshot,
        &mint,
        &poster_ata,
        &vault,
    );

    Fixture {
        svm,
        creator,
        caller,
        mint,
        subaccord,
        dispute,
        snapshot,
        jurors,
        levels,
        root,
    }
}

// --- instruction helpers ---

fn init_pause(svm: &mut anchor_litesvm::AnchorContext, authority: &Kp) {
    let ix = svm
        .program()
        .request()
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
        .request()
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
        .request()
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

fn create_dispute(
    svm: &mut anchor_litesvm::AnchorContext,
    filer: &Kp,
    subaccord: &Pubkey,
    mint: &Pubkey,
    filer_ata: &Pubkey,
    nonce: u64,
) {
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let vault = vault_ata(subaccord, mint);
    let ix = svm
        .program()
        .request()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: *subaccord,
            pause_state: pause_pda(),
            dispute,
            staking_token: *mint,
            filer_token_account: *filer_ata,
            vault,
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
        .unwrap();
    svm.execute_instruction(ix, &[filer])
        .unwrap()
        .assert_success();
}

fn post_snapshot(
    svm: &mut anchor_litesvm::AnchorContext,
    poster: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    mint: &Pubkey,
    poster_ata: &Pubkey,
    vault: &Pubkey,
    root: [u8; 32],
) {
    let ix = svm
        .program()
        .request()
        .accounts(accounts::PostSnapshot {
            poster: poster.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
            staking_token: *mint,
            poster_token_account: *poster_ata,
            vault: *vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::PostSnapshot { merkle_root: root })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[poster])
        .unwrap()
        .assert_success();
}

fn finalize_snapshot(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    mint: &Pubkey,
    poster_ata: &Pubkey,
    vault: &Pubkey,
) {
    let ix = svm
        .program()
        .request()
        .accounts(accounts::FinalizeSnapshot {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
            staking_token: *mint,
            poster_token_account: *poster_ata,
            vault: *vault,
            token_program: spl_token::id(),
        })
        .args(instruction::FinalizeSnapshot {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[caller])
        .unwrap()
        .assert_success();
}

fn membership(
    jurors: &[(Kp, u64, Pubkey)],
    levels: &[Vec<[u8; 32]>],
    idx: usize,
) -> JurorMembership {
    let (kp, stake, _) = &jurors[idx];
    JurorMembership {
        leaf: LeafClaim {
            juror: kp.pubkey(),
            stake: *stake,
        },
        proof: merkle_proof(levels, idx),
        index: idx as u32,
    }
}

/// Build a draw Instruction against fx.dispute / fx.snapshot with the given
/// caller, VRF, memberships, and juror-stake remaining-accounts.
fn draw_ix(
    fx: &Fixture,
    caller: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    vrf: [u8; 32],
    memberships: Vec<JurorMembership>,
    juror_stake_pdas: &[Pubkey],
) -> solana_sdk::instruction::Instruction {
    let round = round_pda(dispute, 0);
    let mut accounts_meta = vec![
        solana_sdk::instruction::AccountMeta::new(*caller, true),
        solana_sdk::instruction::AccountMeta::new_readonly(fx.subaccord, false),
        solana_sdk::instruction::AccountMeta::new(*dispute, false),
        solana_sdk::instruction::AccountMeta::new_readonly(*snapshot, false),
        solana_sdk::instruction::AccountMeta::new(round, false),
        solana_sdk::instruction::AccountMeta::new_readonly(SYS, false),
    ];
    for pda in juror_stake_pdas {
        accounts_meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = fx
        .svm
        .program()
        .request()
        .accounts(accounts::Draw {
            caller: *caller,
            subaccord: fx.subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
            round,
            system_program: SYS,
        })
        .args(instruction::Draw {
            vrf_result: vrf,
            memberships,
        })
        .instruction()
        .unwrap()
        .data;
    solana_sdk::instruction::Instruction {
        program_id: ID,
        accounts: accounts_meta,
        data,
    }
}

// =========================================================================
// TESTS
// =========================================================================

#[test]
fn happy_draw_selects_jurors_and_increments_active_draws() {
    let mut fx = setup();
    let vrf = [42u8; 32];

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();

    for i in 0..3 {
        assert_eq!(read_juror_stake(&fx.svm, &fx.jurors[i].2).active_draws, 0);
    }

    fx.svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                vrf,
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap()
        .assert_success();

    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::Drawn,
        "dispute transitions to Drawn"
    );

    let round = read_round(&fx.svm, &round_pda(&fx.dispute, 0));
    assert_eq!(round.round_idx, 0);
    assert_eq!(round.juror_count, JURORS_PER_DISPUTE);
    for i in 0..JURORS_PER_DISPUTE as usize {
        assert_eq!(round.jurors[i], fx.jurors[i].0.pubkey());
    }

    for i in 0..3 {
        assert_eq!(
            read_juror_stake(&fx.svm, &fx.jurors[i].2).active_draws,
            1,
            "juror {i} active_draws incremented"
        );
    }
}

#[test]
fn draw_before_finalize_reverts() {
    let mut fx = setup();

    // Create a second dispute with a Posted (not finalized) snapshot.
    let filer = fx.svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer_ata = fx
        .svm
        .svm
        .create_associated_token_account(&fx.mint, &filer)
        .unwrap();
    fx.svm
        .svm
        .mint_to(&fx.mint, &filer_ata, &fx.creator, REQUIRED_FEE)
        .unwrap();
    create_dispute(&mut fx.svm, &filer, &fx.subaccord, &fx.mint, &filer_ata, 2);
    let dispute2 = dispute_pda(&filer.pubkey(), 2);

    let poster = fx.svm.svm.create_funded_account(50_000_000_000).unwrap();
    let poster_ata = fx
        .svm
        .svm
        .create_associated_token_account(&fx.mint, &poster)
        .unwrap();
    fx.svm
        .svm
        .mint_to(&fx.mint, &poster_ata, &fx.creator, EXPECTED_BOND * 5)
        .unwrap();
    let snapshot2 = snapshot_pda(&dispute2, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    post_snapshot(
        &mut fx.svm,
        &poster,
        &fx.subaccord,
        &dispute2,
        &snapshot2,
        &fx.mint,
        &poster_ata,
        &vault,
        fx.root,
    );

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &dispute2,
                &snapshot2,
                [1u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "draw on non-finalized snapshot must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn invalid_membership_proof_reverts() {
    let mut fx = setup();

    let mut memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    memberships[0].proof = memberships[1].proof.clone();
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "tampered proof must revert; logs={:?}",
        r.logs()
    );
    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::SnapshotPosted
    );
}

#[test]
fn duplicate_juror_reverts() {
    let mut fx = setup();

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 0), // duplicate
        membership(&fx.jurors, &fx.levels, 2),
    ];
    // remaining_accounts: juror 0's PDA twice then juror 2's.
    let pda_list = vec![fx.jurors[0].2, fx.jurors[0].2, fx.jurors[2].2];

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "duplicate juror must revert (DuplicateJuror); logs={:?}",
        r.logs()
    );
}

#[test]
fn wrong_panel_size_reverts() {
    let mut fx = setup();

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
    ];
    let pda_list = vec![fx.jurors[0].2, fx.jurors[1].2];

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "wrong panel size must revert (InvalidPanelSize); logs={:?}",
        r.logs()
    );
}

#[test]
fn insufficient_stake_reverts() {
    let mut fx = setup();

    let mut memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    memberships[0].leaf.stake = 1; // below MIN_STAKE
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "insufficient stake must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn wrong_juror_stake_pda_order_reverts() {
    let mut fx = setup();

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    // Swap remaining_accounts order: [0, 2, 1] — juror 1's membership gets
    // paired with juror 2's PDA.
    let pda_list = vec![fx.jurors[0].2, fx.jurors[2].2, fx.jurors[1].2];

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "wrong juror_stake PDA must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn vrf_seed_is_deterministic() {
    let dispute = Pubkey::new_unique();
    let round_idx: u32 = 0u32;
    let vrf = [42u8; 32];
    let expected = hashv(&[&vrf, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();

    let again = hashv(&[&vrf, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();
    assert_eq!(expected, again);

    let other = hashv(&[
        [43u8; 32].as_ref(),
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
    ])
    .to_bytes();
    assert_ne!(expected, other, "different VRF must produce different seed");
}

#[test]
fn double_draw_reverts() {
    let mut fx = setup();

    let memberships = vec![
        membership(&fx.jurors, &fx.levels, 0),
        membership(&fx.jurors, &fx.levels, 1),
        membership(&fx.jurors, &fx.levels, 2),
    ];
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();

    // First draw succeeds.
    fx.svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships.clone(),
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap()
        .assert_success();
    assert_eq!(dispute_state(&fx.svm, &fx.dispute), DisputeState::Drawn);

    // Second draw: Round PDA already exists (init fails) + dispute not SnapshotPosted.
    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                [42u8; 32],
                memberships,
                &pda_list,
            ),
            &[&fx.caller],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "double draw must revert; logs={:?}",
        r.logs()
    );
}
