#![cfg(feature = "no-entrypoint")]
//! `commit` / `reveal` / `finalize_round` / `finalize_dispute` / `get_ruling`
//! tests (veridao-pq1s). LiteSVM exercises the commit-reveal voting cycle and
//! the finalization economics (slash + redistribute + active_draws decrement).
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy     : commit → reveal → finalize_round → finalize_dispute → Final
//! - window    : commit before review_end                -> revert (CommitWindowClosed)
//! - window    : reveal before commit_end                -> revert (RevealWindowClosed)
//! - copy      : juror B copies juror A's commit hash    -> reveal revert (RevealMismatch)
//! - double    : double-commit                            -> revert (CommitAlreadyExists)
//! - mismatch  : wrong salt on reveal                    -> revert (RevealMismatch)
//! - economics : 2 coherent + 1 incoherent → exact slash/redistribution
//! - non-reveal: non-revealing juror treated as incoherent
//! - crank     : finalize_round before reveal_end        -> revert (RoundNotFinalizable)
//! - crank     : finalize_dispute before appeal window   -> revert (AppealWindowOpen)
//! - draws     : active_draws decremented to 0 for all jurors
//! - ruling    : get_ruling returns None before Final, Some(ruling) after
//!
//! Run via `make test_unit`.

#![cfg(feature = "no-entrypoint")]

use accord::constants::{
    APPEAL_WINDOW_SECS, DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_ROUND,
    SEED_SNAPSHOT, SEED_SUBACCORD,
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

const SYS: Pubkey = anchor_lang::system_program::ID;
const JURORS_PER_DISPUTE: u32 = 3;
const FEE_PER_JUROR: u64 = 1_000_000;
const REQUIRED_FEE: u64 = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
const MIN_STAKE: u64 = 1_000;
const STAKE_AMOUNT: u64 = 5_000;
const EXPECTED_BOND: u64 = 31 * FEE_PER_JUROR;
const REVIEW_WINDOW: u64 = 7 * 24 * 3600;
const COMMIT_WINDOW: u64 = 2 * 24 * 3600;
const REVEAL_WINDOW: u64 = 2 * 24 * 3600;

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
fn read_dispute(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Dispute {
    let acc = svm.svm.get_account(pda).expect("dispute exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn dispute_state(svm: &anchor_litesvm::AnchorContext, dispute: &Pubkey) -> DisputeState {
    read_dispute(svm, dispute).state
}
fn warp_timestamp(svm: &mut anchor_litesvm::AnchorContext, ts: i64) {
    let mut clock = svm.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.svm.set_sysvar::<Clock>(&clock);
}
fn warp_slot(svm: &mut anchor_litesvm::AnchorContext, slot: u64) {
    let mut clock = svm.svm.get_sysvar::<Clock>();
    clock.slot = slot;
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

/// Commit hash format: `H(vote_le || salt || juror_pubkey)`.
fn commit_hash(vote: u8, salt: &[u8; 32], juror: &Pubkey) -> [u8; 32] {
    hashv(&[&[vote], salt, juror.as_ref()]).to_bytes()
}

struct Fixture {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    caller: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    snapshot: Pubkey,
    round: Pubkey,
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

    // Draw
    let memberships = vec![
        membership(&jurors, &levels, 0),
        membership(&jurors, &levels, 1),
        membership(&jurors, &levels, 2),
    ];
    let pda_list: Vec<Pubkey> = (0..3).map(|i| jurors[i].2).collect();
    draw(
        &mut svm,
        &caller,
        &subaccord,
        &dispute,
        &snapshot,
        [42u8; 32],
        memberships,
        &pda_list,
    );

    let round = round_pda(&dispute, 0);

    Fixture {
        svm,
        creator,
        caller,
        mint,
        subaccord,
        dispute,
        snapshot,
        round,
        jurors,
        levels,
        root,
    }
}

// --- instruction helpers ---

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
            min_stake: MIN_STAKE,
            jurors_per_dispute: JURORS_PER_DISPUTE,
            alpha_bps: DEFAULT_ALPHA_BPS,
            review_window: REVIEW_WINDOW,
            commit_window: COMMIT_WINDOW,
            reveal_window: REVEAL_WINDOW,
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

fn draw(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    vrf: [u8; 32],
    memberships: Vec<JurorMembership>,
    juror_stake_pdas: &[Pubkey],
) {
    let round = round_pda(dispute, 0);
    let mut accounts_meta = vec![
        solana_sdk::instruction::AccountMeta::new(caller.pubkey(), true),
        solana_sdk::instruction::AccountMeta::new_readonly(*subaccord, false),
        solana_sdk::instruction::AccountMeta::new(*dispute, false),
        solana_sdk::instruction::AccountMeta::new_readonly(*snapshot, false),
        solana_sdk::instruction::AccountMeta::new(round, false),
        solana_sdk::instruction::AccountMeta::new_readonly(SYS, false),
    ];
    for pda in juror_stake_pdas {
        accounts_meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = svm
        .program()
        .accounts(accounts::Draw {
            caller: caller.pubkey(),
            subaccord: *subaccord,
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
    let ix = solana_sdk::instruction::Instruction {
        program_id: ID,
        accounts: accounts_meta,
        data,
    };
    svm.execute_instruction(ix, &[caller])
        .unwrap()
        .assert_success();
}

fn do_commit(
    svm: &mut anchor_litesvm::AnchorContext,
    juror: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
    commitment: [u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    let ix = svm
        .program()
        .accounts(accounts::Commit {
            juror: juror.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
        })
        .args(instruction::Commit { commitment })
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[juror])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("commit failed: {:?}", r.logs()).into())
    }
}

fn do_reveal(
    svm: &mut anchor_litesvm::AnchorContext,
    juror: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
    vote: u8,
    salt: [u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    let ix = svm
        .program()
        .accounts(accounts::Reveal {
            juror: juror.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
        })
        .args(instruction::Reveal { vote, salt })
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[juror])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("reveal failed: {:?}", r.logs()).into())
    }
}

fn do_finalize_round(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let ix = svm
        .program()
        .accounts(accounts::FinalizeRound {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
        })
        .args(instruction::FinalizeRound {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[caller])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("finalize_round failed: {:?}", r.logs()).into())
    }
}

fn do_finalize_dispute(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
    juror_stake_pdas: &[Pubkey],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut accounts_meta = vec![
        solana_sdk::instruction::AccountMeta::new(caller.pubkey(), true),
        solana_sdk::instruction::AccountMeta::new_readonly(*subaccord, false),
        solana_sdk::instruction::AccountMeta::new(*dispute, false),
        solana_sdk::instruction::AccountMeta::new_readonly(*round, false),
    ];
    for pda in juror_stake_pdas {
        accounts_meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = svm
        .program()
        .accounts(accounts::FinalizeDispute {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
        })
        .args(instruction::FinalizeDispute {})
        .instruction()
        .unwrap()
        .data;
    let ix = solana_sdk::instruction::Instruction {
        program_id: ID,
        accounts: accounts_meta,
        data,
    };
    let r = svm.execute_instruction(ix, &[caller])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("finalize_dispute failed: {:?}", r.logs()).into())
    }
}

fn do_get_ruling(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    dispute: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let ix = svm
        .program()
        .accounts(accounts::GetRuling {
            caller: caller.pubkey(),
            dispute: *dispute,
        })
        .args(instruction::GetRuling {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[caller])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("get_ruling failed: {:?}", r.logs()).into())
    }
}

// =========================================================================
// TESTS
// =========================================================================

#[test]
fn happy_commit_reveal_finalize() {
    let mut fx = setup();

    // All jurors commit vote 0 with unique salts.
    let salts: Vec<[u8; 32]> = (0..3).map(|i| [10 + i as u8; 32]).collect();
    let now = fx.svm.svm.get_sysvar::<Clock>().unix_timestamp;
    // Warp to review_end (commit opens).
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.jurors[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }
    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::Commit,
        "dispute transitions to Commit"
    );
    let r = read_round(&fx.svm, &fx.round);
    assert_eq!(r.commit_count, 3);

    // Warp to commit_end (reveal opens).
    warp_timestamp(&mut fx.svm, r.commit_end);

    for i in 0..3 {
        do_reveal(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            0,
            salts[i],
        )
        .unwrap();
    }
    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::Reveal,
        "dispute transitions to Reveal"
    );
    let r = read_round(&fx.svm, &fx.round);
    assert_eq!(r.reveal_count, 3);

    // Warp past reveal_end → finalize_round.
    warp_timestamp(&mut fx.svm, r.reveal_end);
    do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap();
    assert_eq!(
        dispute_state(&fx.svm, &fx.dispute),
        DisputeState::RoundResolved
    );
    let r = read_round(&fx.svm, &fx.round);
    assert_eq!(r.result, 0, "plurality winner is option 0");

    // Warp past appeal window → finalize_dispute.
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();
    do_finalize_dispute(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        &pda_list,
    )
    .unwrap();
    assert_eq!(dispute_state(&fx.svm, &fx.dispute), DisputeState::Final);

    let d = read_dispute(&fx.svm, &fx.dispute);
    assert_eq!(d.final_ruling, Some(0));

    // active_draws decremented to 0 for all jurors.
    for i in 0..3 {
        assert_eq!(
            read_juror_stake(&fx.svm, &fx.jurors[i].2).active_draws,
            0,
            "juror {i} active_draws decremented"
        );
    }
}

#[test]
fn commit_before_review_window_reverts() {
    let mut fx = setup();

    // Immediately after draw — before review_end.
    let r = read_round(&fx.svm, &fx.round);
    // Warp to just before review_end.
    warp_timestamp(&mut fx.svm, r.review_end - 1);

    let salt = [99u8; 32];
    let h = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    let err = do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "commit before review window must revert: {err}"
    );
}

#[test]
fn reveal_before_commit_window_reverts() {
    let mut fx = setup();

    // Commit first (warp to review_end).
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    let salt = [88u8; 32];
    let h = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    // Try to reveal immediately (before commit_end).
    let err = do_reveal(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        0,
        salt,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "reveal before commit window must revert: {err}"
    );
}

#[test]
fn commit_copying_prevented() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    // Juror 0 commits hash(vote=0, salt, juror0_pubkey).
    let salt = [77u8; 32];
    let h0 = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h0,
    )
    .unwrap();

    // Juror 1 COPIES juror 0's hash (commit succeeds — we store any 32 bytes).
    do_commit(
        &mut fx.svm,
        &fx.jurors[1].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h0,
    )
    .unwrap();

    // Warp to reveal window.
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    // Juror 1 tries to reveal with juror 0's (vote, salt) → RevealMismatch
    // because hash(0, salt, juror1) != hash(0, salt, juror0) = h0.
    let err = do_reveal(
        &mut fx.svm,
        &fx.jurors[1].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        0,
        salt,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "reveal with copied commit must revert (RevealMismatch): {err}"
    );
}

#[test]
fn double_commit_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    let salt = [55u8; 32];
    let h = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    // Second commit with a different hash → revert.
    let h2 = commit_hash(1, &[44u8; 32], &fx.jurors[0].0.pubkey());
    let err = do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h2,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "double commit must revert (CommitAlreadyExists): {err}"
    );
}

#[test]
fn reveal_wrong_salt_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    let salt = [33u8; 32];
    let h = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    // Reveal with wrong salt → RevealMismatch.
    let err = do_reveal(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        0,
        [22u8; 32],
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "wrong salt must revert (RevealMismatch): {err}"
    );
}

#[test]
fn economics_two_coherent_one_incoherent() {
    let mut fx = setup();

    // Commit: jurors 0,1 vote option 0; juror 2 votes option 1.
    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for (i, vote) in [0u8, 0, 1].iter().enumerate() {
        let h = commit_hash(*vote, &salts[i], &fx.jurors[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    for (i, vote) in [0u8, 0, 1].iter().enumerate() {
        do_reveal(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            *vote,
            salts[i],
        )
        .unwrap();
    }

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end);
    do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap();

    let r = read_round(&fx.svm, &fx.round);
    assert_eq!(r.result, 0, "plurality winner is option 0");
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);

    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();
    do_finalize_dispute(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        &pda_list,
    )
    .unwrap();

    // Economics:
    // slash_per_juror = alpha_bps * min_stake / 10_000 = 1000 * 1000 / 10000 = 100
    // slash_total = 1 * 100 = 100 (juror 2 is incoherent)
    // round_fee = 3 * 1_000_000 = 3_000_000
    // pool = 100 + 3_000_000 = 3_000_100
    // share = 3_000_100 / 2 = 1_500_050
    // coherent: amount += 1_500_050; incoherent: amount -= 100
    let slash_per_juror = (DEFAULT_ALPHA_BPS as u64) * MIN_STAKE / 10_000;
    assert_eq!(slash_per_juror, 100);

    let round_fee = 3 * FEE_PER_JUROR;
    let pool = slash_per_juror + round_fee;
    let share = pool / 2;
    assert_eq!(share, 1_500_050);

    // Coherent jurors 0, 1
    for i in 0..2 {
        let js = read_juror_stake(&fx.svm, &fx.jurors[i].2);
        assert_eq!(
            js.amount,
            STAKE_AMOUNT + share,
            "coherent juror {i} gets share"
        );
        assert_eq!(js.active_draws, 0);
    }

    // Incoherent juror 2
    let js = read_juror_stake(&fx.svm, &fx.jurors[2].2);
    assert_eq!(
        js.amount,
        STAKE_AMOUNT - slash_per_juror,
        "incoherent juror slashed"
    );
    assert_eq!(js.active_draws, 0);
}

#[test]
fn non_revealer_treated_as_incoherent() {
    let mut fx = setup();

    // Jurors 0, 1 commit+reveal option 0. Juror 2 commits but never reveals.
    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for i in 0..3 {
        let vote = if i < 2 { 0u8 } else { 1u8 };
        let h = commit_hash(vote, &salts[i], &fx.jurors[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    // Only jurors 0, 1 reveal.
    for i in 0..2 {
        do_reveal(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            0,
            salts[i],
        )
        .unwrap();
    }

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end);
    do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap();
    assert_eq!(read_round(&fx.svm, &fx.round).result, 0);

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();
    do_finalize_dispute(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        &pda_list,
    )
    .unwrap();

    let slash_per_juror = (DEFAULT_ALPHA_BPS as u64) * MIN_STAKE / 10_000;
    let round_fee = 3 * FEE_PER_JUROR;
    let pool = slash_per_juror + round_fee;
    let share = pool / 2;

    // Coherent jurors 0, 1
    for i in 0..2 {
        let js = read_juror_stake(&fx.svm, &fx.jurors[i].2);
        assert_eq!(js.amount, STAKE_AMOUNT + share, "coherent juror {i}");
    }

    // Non-revealing juror 2: slashed same as incoherent.
    let js = read_juror_stake(&fx.svm, &fx.jurors[2].2);
    assert_eq!(
        js.amount,
        STAKE_AMOUNT - slash_per_juror,
        "non-revealing juror penalized >= incoherent"
    );
    assert_eq!(js.active_draws, 0, "active_draws still decremented");
}

#[test]
fn finalize_round_before_reveal_end_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    // Warp to just before reveal_end.
    warp_timestamp(&mut fx.svm, r.reveal_end - 1);

    let err = do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "finalize_round before reveal_end must revert: {err}"
    );
}

#[test]
fn finalize_dispute_before_appeal_window_reverts() {
    let mut fx = setup();

    // Commit + reveal (all vote 0).
    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.jurors[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);
    for i in 0..3 {
        do_reveal(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            0,
            salts[i],
        )
        .unwrap();
    }
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end);
    do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap();

    // Warp to just before appeal deadline.
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS - 1);

    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();
    let err = do_finalize_dispute(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        &pda_list,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "finalize_dispute before appeal window must revert: {err}"
    );
}

#[test]
fn get_ruling_returns_none_before_final() {
    let mut fx = setup();

    // Before finalize → get_ruling succeeds but returns None (encoded as return data).
    // We just verify the instruction doesn't revert and the dispute has final_ruling=None.
    do_get_ruling(&mut fx.svm, &fx.caller, &fx.dispute).unwrap();
    let d = read_dispute(&fx.svm, &fx.dispute);
    assert_eq!(d.final_ruling, None);
}

#[test]
fn get_ruling_returns_some_after_final() {
    let mut fx = setup();

    // Full cycle → Final.
    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.jurors[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);
    for i in 0..3 {
        do_reveal(
            &mut fx.svm,
            &fx.jurors[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            0,
            salts[i],
        )
        .unwrap();
    }
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end);
    do_finalize_round(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
    )
    .unwrap();
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    let pda_list: Vec<Pubkey> = (0..3).map(|i| fx.jurors[i].2).collect();
    do_finalize_dispute(
        &mut fx.svm,
        &fx.caller,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        &pda_list,
    )
    .unwrap();

    do_get_ruling(&mut fx.svm, &fx.caller, &fx.dispute).unwrap();
    let d = read_dispute(&fx.svm, &fx.dispute);
    assert_eq!(d.final_ruling, Some(0));
}

#[test]
fn not_drawn_juror_commit_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    // Create a random keypair that was NOT drawn.
    let outsider = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    let salt = [66u8; 32];
    let h = commit_hash(0, &salt, &outsider.pubkey());

    let err = do_commit(
        &mut fx.svm,
        &outsider,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    );
    assert!(err.is_err(), "non-drawn juror commit must revert");
}

#[test]
fn invalid_vote_index_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    let salt = [11u8; 32];
    // Commit with vote=0 (valid), but try to reveal with vote=5 (out of range).
    // The commit stores hash(0, salt, juror), but reveal is called with vote=5.
    // This will fail on BOTH checks: InvalidVote (5 >= num_options=2) and
    // RevealMismatch. InvalidVote is checked first.
    let h = commit_hash(0, &salt, &fx.jurors[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    let err = do_reveal(
        &mut fx.svm,
        &fx.jurors[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        5, // invalid — only options 0,1 exist
        salt,
    );
    assert!(err.is_err(), "invalid vote index must revert");
}
