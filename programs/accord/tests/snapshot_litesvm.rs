//! `post_snapshot` / `challenge_snapshot` / `finalize_snapshot` tests
//! (veridao-rrxs). LiteSVM exercises the ADR-0003 snapshot trust lifecycle:
//! bond custody, the 1-day challenge-window time-gate (via Clock warp), and the
//! duplicate-Juror Merkle fraud proof.
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - post   : bond moves to vault + Snapshot Posted + dispute SnapshotPosted
//! - fraud  : duplicate-Juror proof        -> voided + poster bond to challenger
//! - false  : valid leaves, distinct Jurors -> challenger bond to poster
//! - window : challenge after deadline      -> must fail (window expired)
//! - fin    : finalize before deadline      -> must fail (window open)
//! - fin    : finalize after deadline       -> bond returned, status Finalized
//!
//! Run via `make test_unit`.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{
    DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_SNAPSHOT, SEED_SUBACCORD,
    SNAPSHOT_CHALLENGE_WINDOW_SECS,
};
use accord::state::{Dispute, DisputeState, FraudProof, LeafClaim, Snapshot, SnapshotStatus};
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
// max appeal panel for (3, 3): (3+1)*2^3 - 1 = 31; bond = 31 * fee_per_juror.
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
fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}
fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(subaccord, mint)
}
fn read_snapshot(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Snapshot {
    let acc = svm.svm.get_account(pda).expect("snapshot PDA exists");
    Snapshot::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn token_amount(svm: &anchor_litesvm::AnchorContext, ata: &Pubkey) -> u64 {
    let acc = svm.svm.get_account(ata).expect("token account exists");
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&acc.data[64..72]);
    u64::from_le_bytes(buf)
}
fn now_ts(svm: &anchor_litesvm::AnchorContext) -> i64 {
    svm.svm.get_sysvar::<Clock>().unix_timestamp
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

/// Build a perfect binary Merkle tree (leaves padded to a power of two with
/// zero hashes). Returns (levels, root); `levels[0]` = leaves.
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

/// Authentication path for the leaf at `idx` (sibling hashes, rootward).
fn merkle_proof(levels: &[Vec<[u8; 32]>], mut idx: usize) -> Vec<[u8; 32]> {
    let mut siblings = Vec::new();
    for lvl in levels.iter().take(levels.len() - 1) {
        siblings.push(lvl[idx ^ 1]);
        idx >>= 1;
    }
    siblings
}

/// Funded creator + subcord over `mint` + 3 staked Jurors + a filed Dispute
/// (state == Created) + a funded poster and challenger.
struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    poster: Kp,
    challenger: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    poster_ata: Pubkey,
    challenger_ata: Pubkey,
}

fn setup() -> Fixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let poster = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let challenger = svm.svm.create_funded_account(50_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &subaccord, &mint, risk_type);

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
        .mint_to(&mint, &filer_ata, &creator, REQUIRED_FEE)
        .unwrap();
    create_dispute(&mut svm, &filer, &subaccord, &mint, &filer_ata, 1);

    let poster_ata = svm
        .svm
        .create_associated_token_account(&mint, &poster)
        .unwrap();
    svm.svm
        .mint_to(&mint, &poster_ata, &creator, EXPECTED_BOND * 5)
        .unwrap();
    let challenger_ata = svm
        .svm
        .create_associated_token_account(&mint, &challenger)
        .unwrap();
    svm.svm
        .mint_to(&mint, &challenger_ata, &creator, EXPECTED_BOND * 5)
        .unwrap();

    let dispute = dispute_pda(&filer.pubkey(), 1);
    Fixture {
        svm,
        poster,
        challenger,
        mint,
        subaccord,
        dispute,
        poster_ata,
        challenger_ata,
    }
}

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

#[allow(clippy::too_many_arguments)]
fn post_snapshot_ix(
    svm: &anchor_litesvm::AnchorContext,
    poster: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    mint: &Pubkey,
    poster_ata: &Pubkey,
    vault: &Pubkey,
    merkle_root: [u8; 32],
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .request()
        .accounts(accounts::PostSnapshot {
            poster: *poster,
            subaccord: *subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
            staking_token: *mint,
            poster_token_account: *poster_ata,
            vault: *vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::PostSnapshot { merkle_root })
        .instruction()
        .unwrap()
}

#[allow(clippy::too_many_arguments)]
fn challenge_ix(
    svm: &anchor_litesvm::AnchorContext,
    challenger: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    mint: &Pubkey,
    challenger_ata: &Pubkey,
    poster_ata: &Pubkey,
    vault: &Pubkey,
    proof: FraudProof,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .request()
        .accounts(accounts::ChallengeSnapshot {
            challenger: *challenger,
            subaccord: *subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
            staking_token: *mint,
            challenger_token_account: *challenger_ata,
            poster_token_account: *poster_ata,
            vault: *vault,
            token_program: spl_token::id(),
        })
        .args(instruction::ChallengeSnapshot { proof })
        .instruction()
        .unwrap()
}

#[allow(clippy::too_many_arguments)]
fn finalize_ix(
    svm: &anchor_litesvm::AnchorContext,
    caller: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    mint: &Pubkey,
    poster_ata: &Pubkey,
    vault: &Pubkey,
) -> solana_sdk::instruction::Instruction {
    svm.program()
        .request()
        .accounts(accounts::FinalizeSnapshot {
            caller: *caller,
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
        .unwrap()
}

fn dispute_state(svm: &anchor_litesvm::AnchorContext, dispute: &Pubkey) -> DisputeState {
    let acc = svm.svm.get_account(dispute).expect("dispute exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap().state
}

fn make_leaf(
    juror: Pubkey,
    stake: u64,
    idx: u32,
    levels: &[Vec<[u8; 32]>],
) -> (LeafClaim, Vec<[u8; 32]>, u32) {
    (
        LeafClaim { juror, stake },
        merkle_proof(levels, idx as usize),
        idx,
    )
}

#[test]
fn post_snapshot_bonds_and_sets_deadline() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let root = [42u8; 32];
    let ts_before = now_ts(&fx.svm);
    let poster_before = token_amount(&fx.svm, &fx.poster_ata);

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    // bond custody: poster lost EXPECTED_BOND
    assert_eq!(
        token_amount(&fx.svm, &fx.poster_ata),
        poster_before - EXPECTED_BOND
    );
    let snap = read_snapshot(&fx.svm, &snapshot);
    assert_eq!(snap.merkle_root, root);
    assert_eq!(snap.poster, fx.poster.pubkey());
    assert_eq!(snap.bond, EXPECTED_BOND);
    assert_eq!(snap.status, SnapshotStatus::Posted);
    assert_eq!(
        snap.challenge_deadline,
        ts_before + SNAPSHOT_CHALLENGE_WINDOW_SECS,
        "1-day challenge window from post time"
    );
    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::SnapshotPosted,
        "dispute transitions Created -> SnapshotPosted"
    );
}

#[test]
fn challenge_fraud_voids_and_pays_challenger() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    // fraudulent tree: Juror JA duplicated at index 0 and 2 with different stakes
    let ja = Pubkey::new_unique();
    let jb = Pubkey::new_unique();
    let jc = Pubkey::new_unique();
    let leaves = vec![
        leaf_hash(&ja, 100),
        leaf_hash(&jb, 200),
        leaf_hash(&ja, 300), // duplicate of JA
        leaf_hash(&jc, 400),
    ];
    let (levels, root) = build_tree(leaves);

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    let challenger_before = token_amount(&fx.svm, &fx.challenger_ata);
    let (la, pa, ia) = make_leaf(ja, 100, 0, &levels);
    let (lb, pb, ib) = make_leaf(ja, 300, 2, &levels);
    let proof = FraudProof {
        leaf_a: la,
        proof_a: pa,
        index_a: ia,
        leaf_b: lb,
        proof_b: pb,
        index_b: ib,
    };

    fx.svm
        .execute_instruction(
            challenge_ix(
                &fx.svm,
                &fx.challenger.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.challenger_ata,
                &fx.poster_ata,
                &vault,
                proof,
            ),
            &[&fx.challenger],
        )
        .unwrap()
        .assert_success();

    // fraud proven: snapshot voided
    assert_eq!(
        read_snapshot(&fx.svm, &snapshot).status,
        SnapshotStatus::Voided
    );
    // challenger nets +bond: paid bond in, received poster's bond + own back
    assert_eq!(
        token_amount(&fx.svm, &fx.challenger_ata),
        challenger_before + EXPECTED_BOND,
        "challenger gains the poster's forfeited bond"
    );
}

#[test]
fn challenge_false_pays_poster() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);

    // correct tree: four DISTINCT jurors — no duplicate exists to prove
    let j1 = Pubkey::new_unique();
    let j2 = Pubkey::new_unique();
    let j3 = Pubkey::new_unique();
    let j4 = Pubkey::new_unique();
    let leaves = vec![
        leaf_hash(&j1, 100),
        leaf_hash(&j2, 200),
        leaf_hash(&j3, 300),
        leaf_hash(&j4, 400),
    ];
    let (levels, root) = build_tree(leaves);

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    let challenger_before = token_amount(&fx.svm, &fx.challenger_ata);
    let poster_before = token_amount(&fx.svm, &fx.poster_ata);
    // challenger presents two valid leaves with DISTINCT jurors -> not fraud
    let (la, pa, ia) = make_leaf(j1, 100, 0, &levels);
    let (lb, pb, ib) = make_leaf(j2, 200, 1, &levels);
    let proof = FraudProof {
        leaf_a: la,
        proof_a: pa,
        index_a: ia,
        leaf_b: lb,
        proof_b: pb,
        index_b: ib,
    };

    fx.svm
        .execute_instruction(
            challenge_ix(
                &fx.svm,
                &fx.challenger.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.challenger_ata,
                &fx.poster_ata,
                &vault,
                proof,
            ),
            &[&fx.challenger],
        )
        .unwrap()
        .assert_success();

    // false challenge: challenger forfeits bond to poster; snapshot stays Posted
    assert_eq!(
        read_snapshot(&fx.svm, &snapshot).status,
        SnapshotStatus::Posted,
        "snapshot stays Posted after a false challenge"
    );
    assert_eq!(
        token_amount(&fx.svm, &fx.challenger_ata),
        challenger_before - EXPECTED_BOND,
        "challenger loses the bond"
    );
    assert_eq!(
        token_amount(&fx.svm, &fx.poster_ata),
        poster_before + EXPECTED_BOND,
        "poster gains the challenger's bond"
    );
}

#[test]
fn challenge_after_window_reverts() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let root = [9u8; 32];

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    let deadline = read_snapshot(&fx.svm, &snapshot).challenge_deadline;
    warp_timestamp(&mut fx.svm, deadline + 1); // window expired

    // any plausible-looking proof; the time-gate fires before verification
    let proof = FraudProof {
        leaf_a: LeafClaim {
            juror: Pubkey::new_unique(),
            stake: 1,
        },
        proof_a: vec![],
        index_a: 0,
        leaf_b: LeafClaim {
            juror: Pubkey::new_unique(),
            stake: 2,
        },
        proof_b: vec![],
        index_b: 1,
    };
    let r = fx
        .svm
        .execute_instruction(
            challenge_ix(
                &fx.svm,
                &fx.challenger.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.challenger_ata,
                &fx.poster_ata,
                &vault,
                proof,
            ),
            &[&fx.challenger],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "challenge after the window must revert (SnapshotChallengeWindowExpired); logs={:?}",
        r.logs()
    );
    assert_eq!(
        read_snapshot(&fx.svm, &snapshot).status,
        SnapshotStatus::Posted,
        "snapshot untouched"
    );
}

#[test]
fn finalize_before_window_reverts() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let root = [9u8; 32];

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    let r = fx
        .svm
        .execute_instruction(
            finalize_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
            ),
            &[&cranker],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "finalize before the window must revert (SnapshotChallengeWindowOpen); logs={:?}",
        r.logs()
    );
    assert_eq!(
        read_snapshot(&fx.svm, &snapshot).status,
        SnapshotStatus::Posted,
        "snapshot stays Posted"
    );
}

#[test]
fn finalize_after_window_returns_bond() {
    let mut fx = setup();
    let snapshot = snapshot_pda(&fx.dispute, 0);
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let root = [9u8; 32];

    fx.svm
        .execute_instruction(
            post_snapshot_ix(
                &fx.svm,
                &fx.poster.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
                root,
            ),
            &[&fx.poster],
        )
        .unwrap()
        .assert_success();

    let deadline = read_snapshot(&fx.svm, &snapshot).challenge_deadline;
    let poster_before = token_amount(&fx.svm, &fx.poster_ata);
    warp_timestamp(&mut fx.svm, deadline + 1); // window elapsed

    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    fx.svm
        .execute_instruction(
            finalize_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &snapshot,
                &fx.mint,
                &fx.poster_ata,
                &vault,
            ),
            &[&cranker],
        )
        .unwrap()
        .assert_success();

    assert_eq!(
        read_snapshot(&fx.svm, &snapshot).status,
        SnapshotStatus::Finalized
    );
    assert_eq!(
        token_amount(&fx.svm, &fx.poster_ata),
        poster_before + EXPECTED_BOND,
        "poster bond returned after an unchallenged window"
    );
}
