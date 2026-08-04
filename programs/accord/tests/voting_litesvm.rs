#![cfg(feature = "no-entrypoint")]
//! `commit` / `reveal` / `finalize_round` / `finalize_dispute` / `get_ruling`
//! tests (veridao-pq1s). LiteSVM exercises the commit-reveal voting cycle and
//! the finalization economics (slash + redistribute + active_draws decrement).
//!
//! Run via `make test_unit`.

use accord::constants::{
    APPEAL_WINDOW_SECS, DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_ROUND,
    SEED_SNAPSHOT, SEED_SUBACCORD,
};
use accord::state::{
    Dispute, DisputeState, JurorMembership, JurorStake, LeafClaim, MSTNode, Round, Snapshot,
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
const COMMITTED_VRF: [u8; 32] = [42u8; 32];

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

type Kp = solana_sdk::signature::Keypair;
type HashSum = ([u8; 32], u64);

// --- Merkle-Sum Tree helpers ---

fn leaf_hash(juror: &Pubkey, stake: u64, cum_after: u64) -> [u8; 32] {
    hashv(&[
        juror.as_ref(),
        &stake.to_le_bytes(),
        &cum_after.to_le_bytes(),
    ])
    .to_bytes()
}
fn mst_parent(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[left, right]).to_bytes()
}
fn build_mst(claims: &[LeafClaim]) -> (Vec<Vec<HashSum>>, [u8; 32], u64) {
    let mut leaves: Vec<HashSum> = claims
        .iter()
        .map(|c| (leaf_hash(&c.juror, c.stake, c.cum_after), c.stake))
        .collect();
    let mut size = 1;
    while size < leaves.len().max(1) {
        size *= 2;
    }
    leaves.resize(size, ([0u8; 32], 0));
    let mut levels = vec![leaves];
    while levels.last().unwrap().len() > 1 {
        let next: Vec<HashSum> = levels
            .last()
            .unwrap()
            .chunks(2)
            .map(|p| (mst_parent(&p[0].0, &p[1].0), p[0].1 + p[1].1))
            .collect();
        levels.push(next);
    }
    let root = levels.last().unwrap()[0];
    (levels, root.0, root.1)
}
fn mst_proof(levels: &[Vec<HashSum>], mut idx: usize) -> Vec<MSTNode> {
    let mut siblings = Vec::new();
    for lvl in levels.iter().take(levels.len() - 1) {
        let s = lvl[idx ^ 1];
        siblings.push(MSTNode {
            sibling_hash: s.0,
            sibling_sum: s.1,
        });
        idx >>= 1;
    }
    siblings
}

// --- Sortition helpers ---

fn vrf_seed(
    committed_vrf: &[u8; 32],
    dispute: &Pubkey,
    round_idx: u32,
    draw_attempt: u32,
) -> [u8; 32] {
    hashv(&[
        committed_vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &draw_attempt.to_le_bytes(),
    ])
    .to_bytes()
}
fn sortition_pick(
    claims: &[LeafClaim],
    total_stake: u64,
    seed: &[u8; 32],
    panel: usize,
) -> Vec<usize> {
    (0..panel)
        .map(|i| {
            let r_hash = hashv(&[seed, &(i as u32).to_le_bytes()]).to_bytes();
            let r_i = u64::from_le_bytes(r_hash[0..8].try_into().unwrap_or([0u8; 8])) % total_stake;
            claims
                .iter()
                .position(|c| {
                    let cum_before = c.cum_after.saturating_sub(c.stake);
                    cum_before <= r_i && r_i < c.cum_after
                })
                .unwrap()
        })
        .collect()
}
fn find_distinct_attempt(
    claims: &[LeafClaim],
    total_stake: u64,
    committed_vrf: &[u8; 32],
    dispute: &Pubkey,
    round_idx: u32,
    panel: usize,
) -> (u32, Vec<usize>) {
    for attempt in 0..10_000u32 {
        let seed = vrf_seed(committed_vrf, dispute, round_idx, attempt);
        let picks = sortition_pick(claims, total_stake, &seed, panel);
        let unique: std::collections::HashSet<usize> = picks.iter().copied().collect();
        if unique.len() == panel {
            return (attempt, picks);
        }
    }
    panic!("no distinct draw_attempt found in 10k tries");
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
    sorted_claims: Vec<LeafClaim>,
    sorted_to_orig: Vec<usize>,
    /// The juror keypair + PDA for each drawn slot, in draw order.
    drawn: Vec<(Kp, Pubkey)>,
    levels: Vec<Vec<HashSum>>,
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

    // Sort jurors by pubkey and build MST.
    let mut order: Vec<usize> = (0..jurors.len()).collect();
    order.sort_by_key(|&i| jurors[i].0.pubkey());
    let mut cum = 0u64;
    let sorted_claims: Vec<LeafClaim> = order
        .iter()
        .map(|&i| {
            cum += jurors[i].1;
            LeafClaim {
                juror: jurors[i].0.pubkey(),
                stake: jurors[i].1,
                cum_after: cum,
            }
        })
        .collect();
    let (levels, root, total_stake) = build_mst(&sorted_claims);

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
        total_stake,
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

    commit_vrf(
        &mut svm,
        &caller,
        &subaccord,
        &dispute,
        &snapshot,
        COMMITTED_VRF,
    );

    // Find a draw_attempt that selects 3 distinct jurors.
    let (attempt, picks) = find_distinct_attempt(
        &sorted_claims,
        total_stake,
        &COMMITTED_VRF,
        &dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let memberships: Vec<JurorMembership> = picks
        .iter()
        .map(|&si| JurorMembership {
            leaf: sorted_claims[si],
            proof: mst_proof(&levels, si),
            index: si as u32,
        })
        .collect();
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| jurors[order[si]].2).collect();
    draw(
        &mut svm,
        &caller,
        &subaccord,
        &dispute,
        &snapshot,
        attempt,
        memberships,
        &pda_list,
    );

    let round = round_pda(&dispute, 0);
    let drawn: Vec<(Kp, Pubkey)> = picks
        .iter()
        .map(|&si| {
            let orig = order[si];
            (jurors[orig].0.insecure_clone(), jurors[orig].2)
        })
        .collect();

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
        sorted_claims,
        sorted_to_orig: order,
        drawn,
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
    total_stake: u64,
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
        .args(instruction::PostSnapshot {
            merkle_root: root,
            total_stake,
        })
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

fn commit_vrf(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    vrf_result: [u8; 32],
) {
    let ix = svm
        .program()
        .accounts(accounts::CommitVrf {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            snapshot: *snapshot,
        })
        .args(instruction::CommitVrf { vrf_result })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[caller])
        .unwrap()
        .assert_success();
}

#[allow(clippy::too_many_arguments)]
fn draw(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    draw_attempt: u32,
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
            draw_attempt,
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

    let salts: Vec<[u8; 32]> = (0..3).map(|i| [10 + i as u8; 32]).collect();
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.drawn[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.drawn[i].0,
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

    warp_timestamp(&mut fx.svm, r.commit_end);

    for i in 0..3 {
        do_reveal(
            &mut fx.svm,
            &fx.drawn[i].0,
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

    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    let pda_list: Vec<Pubkey> = fx.drawn.iter().map(|(_, pda)| *pda).collect();
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

    for (_, pda) in &fx.drawn {
        assert_eq!(
            read_juror_stake(&fx.svm, pda).active_draws,
            0,
            "drawn juror active_draws decremented"
        );
    }
}

#[test]
fn commit_before_review_window_reverts() {
    let mut fx = setup();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end - 1);

    let salt = [99u8; 32];
    let h = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    let err = do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
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

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    let salt = [88u8; 32];
    let h = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    let err = do_reveal(
        &mut fx.svm,
        &fx.drawn[0].0,
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

    let salt = [77u8; 32];
    let h0 = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h0,
    )
    .unwrap();

    do_commit(
        &mut fx.svm,
        &fx.drawn[1].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h0,
    )
    .unwrap();

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    let err = do_reveal(
        &mut fx.svm,
        &fx.drawn[1].0,
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
    let h = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        h,
    )
    .unwrap();

    let h2 = commit_hash(1, &[44u8; 32], &fx.drawn[0].0.pubkey());
    let err = do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
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
    let h = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
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
        &fx.drawn[0].0,
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

    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for (i, vote) in [0u8, 0, 1].iter().enumerate() {
        let h = commit_hash(*vote, &salts[i], &fx.drawn[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.drawn[i].0,
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
            &fx.drawn[i].0,
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

    let pda_list: Vec<Pubkey> = fx.drawn.iter().map(|(_, pda)| *pda).collect();
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
    assert_eq!(slash_per_juror, 100);

    let round_fee = 3 * FEE_PER_JUROR;
    let pool = slash_per_juror + round_fee;
    let share = pool / 2;
    assert_eq!(share, 1_500_050);

    // Coherent jurors 0, 1
    for i in 0..2 {
        let js = read_juror_stake(&fx.svm, &fx.drawn[i].1);
        assert_eq!(
            js.amount,
            STAKE_AMOUNT + share,
            "coherent juror {i} gets share"
        );
        assert_eq!(js.active_draws, 0);
    }

    // Incoherent juror 2
    let js = read_juror_stake(&fx.svm, &fx.drawn[2].1);
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

    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);

    for i in 0..3 {
        let vote = if i < 2 { 0u8 } else { 1u8 };
        let h = commit_hash(vote, &salts[i], &fx.drawn[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.drawn[i].0,
            &fx.subaccord,
            &fx.dispute,
            &fx.round,
            h,
        )
        .unwrap();
    }

    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.commit_end);

    for i in 0..2 {
        do_reveal(
            &mut fx.svm,
            &fx.drawn[i].0,
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
    let pda_list: Vec<Pubkey> = fx.drawn.iter().map(|(_, pda)| *pda).collect();
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

    for i in 0..2 {
        let js = read_juror_stake(&fx.svm, &fx.drawn[i].1);
        assert_eq!(js.amount, STAKE_AMOUNT + share, "coherent juror {i}");
    }

    let js = read_juror_stake(&fx.svm, &fx.drawn[2].1);
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

    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.drawn[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.drawn[i].0,
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
            &fx.drawn[i].0,
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
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS - 1);

    let pda_list: Vec<Pubkey> = fx.drawn.iter().map(|(_, pda)| *pda).collect();
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

    do_get_ruling(&mut fx.svm, &fx.caller, &fx.dispute).unwrap();
    let d = read_dispute(&fx.svm, &fx.dispute);
    assert_eq!(d.final_ruling, None);
}

#[test]
fn get_ruling_returns_some_after_final() {
    let mut fx = setup();

    let salts: Vec<[u8; 32]> = vec![[10u8; 32], [20u8; 32], [30u8; 32]];
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.review_end);
    for i in 0..3 {
        let h = commit_hash(0, &salts[i], &fx.drawn[i].0.pubkey());
        do_commit(
            &mut fx.svm,
            &fx.drawn[i].0,
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
            &fx.drawn[i].0,
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
    let pda_list: Vec<Pubkey> = fx.drawn.iter().map(|(_, pda)| *pda).collect();
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
    let h = commit_hash(0, &salt, &fx.drawn[0].0.pubkey());
    do_commit(
        &mut fx.svm,
        &fx.drawn[0].0,
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
        &fx.drawn[0].0,
        &fx.subaccord,
        &fx.dispute,
        &fx.round,
        5, // invalid — only options 0,1 exist
        salt,
    );
    assert!(err.is_err(), "invalid vote index must revert");
}
