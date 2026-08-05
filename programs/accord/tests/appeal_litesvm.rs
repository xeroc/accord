#![cfg(feature = "no-entrypoint")]
//! `appeal` + `claim_appeal_refund` tests (veridao-pxr5). LiteSVM exercises the
//! permissionless appeal ladder (2N+1 sizing, max-3 cap, appeal-window gate,
//! exponential cost, bond custody) and the final bond routing (forfeit on
//! no-flip → coherent pool; return on flip via `claim_appeal_refund`).
//!
//! Run via `make test_unit`.

use accord::constants::{
    APPEAL_WINDOW_SECS, DEFAULT_ALPHA_BPS, SEED_APPEAL_BOND, SEED_DISPUTE, SEED_JUROR_STAKE,
    SEED_PAUSE, SEED_ROUND, SEED_SNAPSHOT, SEED_SUBACCORD,
};
use accord::state::{
    Dispute, DisputeState, JurorMembership, JurorStake, LeafClaim, MSTNode, PauseState, Round,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{AccountDeserialize, AccountSerialize};
use anchor_litesvm::{AnchorLiteSVM, TestHelpers};
use solana_program::{clock::Clock, hash::hashv, pubkey::Pubkey};
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::path::PathBuf;

const SYS: Pubkey = anchor_lang::system_program::ID;
const JURORS_PER_DISPUTE: u32 = 3;
const FEE_PER_JUROR: u64 = 1_000_000;
const MIN_STAKE: u64 = 1_000;
const STAKE_AMOUNT: u64 = 5_000;
const N_JURORS: usize = 7;
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
fn appeal_bond_pda(dispute: &Pubkey, round: u32) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_APPEAL_BOND, dispute.as_ref(), &round.to_le_bytes()],
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

fn read_round(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Round {
    let acc = svm.svm.get_account(pda).expect("round PDA exists");
    Round::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_dispute(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Dispute {
    let acc = svm.svm.get_account(pda).expect("dispute exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn dispute_state(svm: &anchor_litesvm::AnchorContext, dispute: &Pubkey) -> DisputeState {
    read_dispute(svm, dispute).state
}
fn current_round(svm: &anchor_litesvm::AnchorContext, dispute: &Pubkey) -> u32 {
    read_dispute(svm, dispute).current_round
}
fn token_balance(svm: &anchor_litesvm::AnchorContext, ata: &Pubkey) -> u64 {
    use solana_program::program_pack::Pack;
    let acc = svm.svm.get_account(ata).expect("ATA exists");
    let ta = spl_token::state::Account::unpack(&acc.data).unwrap();
    ta.amount
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
    panic!("no distinct draw_attempt found in 10k tries for panel {panel}");
}

fn commit_hash(vote: u8, salt: &[u8; 32], juror: &Pubkey) -> [u8; 32] {
    hashv(&[&[vote], salt, juror.as_ref()]).to_bytes()
}

fn panel_for_round(round_idx: u32) -> u32 {
    let factor = 1u32 << round_idx;
    ((JURORS_PER_DISPUTE + 1) * factor - 1).min(31)
}

struct World {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    caller: Kp,
    poster: Kp,
    poster_ata: Pubkey,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    jurors: Vec<(Kp, u64, Pubkey)>,
    sorted_claims: Vec<LeafClaim>,
    sorted_to_orig: Vec<usize>,
    levels: Vec<Vec<HashSum>>,
    root: [u8; 32],
    total_stake: u64,
}

/// Build the world with `n_jurors` stakers, max_appeals configurable.
fn build_world(max_appeals: u8, n_jurors: usize) -> World {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(100_000_000_000).unwrap();
    let caller = svm.svm.create_funded_account(100_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(100_000_000_000).unwrap();
    let poster = svm.svm.create_funded_account(100_000_000_000).unwrap();

    init_pause(&mut svm, &creator);

    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(
        &mut svm,
        &creator,
        &subaccord,
        &mint,
        risk_type,
        max_appeals,
    );

    let mut jurors = Vec::new();
    for _ in 0..n_jurors {
        let juror = svm.svm.create_funded_account(100_000_000_000).unwrap();
        let juror_ata = svm
            .svm
            .create_associated_token_account(&mint, &juror)
            .unwrap();
        svm.svm
            .mint_to(&mint, &juror_ata, &creator, 100_000)
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

    let required_fee = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
    let filer_ata = svm
        .svm
        .create_associated_token_account(&mint, &filer)
        .unwrap();
    svm.svm
        .mint_to(&mint, &filer_ata, &creator, required_fee)
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

    let poster_ata = svm
        .svm
        .create_associated_token_account(&mint, &poster)
        .unwrap();
    svm.svm
        .mint_to(&mint, &poster_ata, &creator, 31 * FEE_PER_JUROR * 10)
        .unwrap();

    World {
        svm,
        creator,
        caller,
        poster,
        poster_ata,
        mint,
        subaccord,
        dispute,
        jurors,
        sorted_claims,
        sorted_to_orig: order,
        levels,
        root,
        total_stake,
    }
}

fn world(max_appeals: u8) -> World {
    build_world(max_appeals, N_JURORS)
}
fn small_world(max_appeals: u8) -> World {
    build_world(max_appeals, 3)
}

/// Run the full snapshot → draw → commit → reveal → finalize_round cycle for the
/// dispute's current round, producing the given plurality winner. `votes[i]` is
/// the vote the i-th drawn juror casts. Returns the round PDA and the drawn
/// jurors' stake PDAs.
fn resolve_round(w: &mut World, votes: &[u8]) -> (Pubkey, Vec<Pubkey>) {
    let dispute = w.dispute;
    let r_idx = current_round(&w.svm, &dispute);
    let panel = panel_for_round(r_idx) as usize;
    assert_eq!(votes.len(), panel, "votes must cover the whole panel");

    let sub = w.subaccord;
    let mint = w.mint;
    let vault = vault_ata(&sub, &mint);
    let snap = snapshot_pda(&dispute, r_idx);
    let poster_ata = w.poster_ata;
    post_snapshot(
        &mut w.svm,
        &w.poster,
        &sub,
        &dispute,
        &snap,
        &mint,
        &poster_ata,
        &vault,
        w.root,
        w.total_stake,
    );
    let snap_acc = {
        let acc = w.svm.svm.get_account(&snap).unwrap();
        accord::state::Snapshot::try_deserialize(&mut &acc.data[..]).unwrap()
    };
    warp_timestamp(&mut w.svm, snap_acc.challenge_deadline + 1);
    finalize_snapshot(
        &mut w.svm,
        &w.creator,
        &sub,
        &dispute,
        &snap,
        &mint,
        &poster_ata,
        &vault,
    );

    // Commit VRF only on the first round (committed_vrf persists across appeals).
    if r_idx == 0 {
        mock_commit_vrf(&mut w.svm, &dispute, COMMITTED_VRF);
    }

    // Find a draw_attempt that selects distinct jurors.
    let (attempt, picks) = find_distinct_attempt(
        &w.sorted_claims,
        w.total_stake,
        &COMMITTED_VRF,
        &dispute,
        r_idx,
        panel,
    );
    let memberships: Vec<JurorMembership> = picks
        .iter()
        .map(|&si| JurorMembership {
            leaf: w.sorted_claims[si],
            proof: mst_proof(&w.levels, si),
            index: si as u32,
        })
        .collect();
    let pda_list: Vec<Pubkey> = picks
        .iter()
        .map(|&si| w.jurors[w.sorted_to_orig[si]].2)
        .collect();
    draw(
        &mut w.svm,
        &w.caller,
        &sub,
        &dispute,
        &snap,
        r_idx,
        attempt,
        memberships,
        &pda_list,
    );

    let round = round_pda(&dispute, r_idx);

    // Collect the drawn juror keypairs (cloned for ergonomic borrow).
    let drawn_kps: Vec<Kp> = picks
        .iter()
        .map(|&si| w.jurors[w.sorted_to_orig[si]].0.insecure_clone())
        .collect();

    // Commit + reveal per drawn juror.
    let r = read_round(&w.svm, &round);
    warp_timestamp(&mut w.svm, r.review_end);
    for i in 0..panel {
        let salt = [10 + i as u8; 32];
        let h = commit_hash(votes[i], &salt, &drawn_kps[i].pubkey());
        do_commit(&mut w.svm, &drawn_kps[i], &sub, &dispute, &round, h).unwrap();
    }
    let r = read_round(&w.svm, &round);
    warp_timestamp(&mut w.svm, r.commit_end);
    for i in 0..panel {
        let salt = [10 + i as u8; 32];
        do_reveal(
            &mut w.svm,
            &drawn_kps[i],
            &sub,
            &dispute,
            &round,
            votes[i],
            salt,
        )
        .unwrap();
    }
    let r = read_round(&w.svm, &round);
    warp_timestamp(&mut w.svm, r.reveal_end);
    do_finalize_round(&mut w.svm, &w.caller, &sub, &dispute, &round).unwrap();

    assert_eq!(dispute_state(&w.svm, &dispute), DisputeState::RoundResolved);
    (round, pda_list)
}

/// Same as resolve_round but for the 3-staker world (round 0 only).
fn resolve_round_small(w: &mut World, votes: &[u8]) -> (Pubkey, Vec<Pubkey>) {
    resolve_round(w, votes)
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

fn do_pause(svm: &mut anchor_litesvm::AnchorContext, authority: &Kp) {
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

fn is_paused(svm: &anchor_litesvm::AnchorContext) -> bool {
    let acc = svm.svm.get_account(&pause_pda()).expect("pause PDA exists");
    PauseState::try_deserialize(&mut &acc.data[..])
        .unwrap()
        .paused
}

fn create_subaccord(
    svm: &mut anchor_litesvm::AnchorContext,
    creator: &Kp,
    subaccord: &Pubkey,
    mint: &Pubkey,
    risk_type: [u8; 32],
    max_appeals: u8,
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
            max_appeals,
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
    let required_fee = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
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
            fee: required_fee,
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

fn mock_commit_vrf(
    svm: &mut anchor_litesvm::AnchorContext,
    dispute: &Pubkey,
    vrf_result: [u8; 32],
) {
    // Mirrors what the on-chain program does: deserialize, mutate, re-serialize
    // into the existing fixed-size account buffer (preserving the allocated
    // length). Resizing would break later instructions that write back the
    // full struct (AccountDidNotSerialize).
    let mut acc = svm.svm.get_account(dispute).expect("dispute exists");
    let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    d.committed_vrf = Some(vrf_result);
    let mut buf = Vec::new();
    d.try_serialize(&mut buf).unwrap();
    assert!(
        buf.len() <= acc.data.len(),
        "serialized dispute exceeds allocated space"
    );
    let len = buf.len();
    acc.data[..len].copy_from_slice(&buf);
    for b in &mut acc.data[len..] {
        *b = 0;
    }
    svm.svm.set_account(*dispute, acc).unwrap();
}

#[allow(clippy::too_many_arguments)]
fn draw(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    round_idx: u32,
    draw_attempt: u32,
    memberships: Vec<JurorMembership>,
    juror_stake_pdas: &[Pubkey],
) {
    let round = round_pda(dispute, round_idx);
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
    appeal_bond_pdas: &[Pubkey],
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
    for pda in appeal_bond_pdas {
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

fn read_appeal_bond(
    svm: &anchor_litesvm::AnchorContext,
    pda: &Pubkey,
) -> accord::state::AppealBond {
    let acc = svm.svm.get_account(pda).expect("appeal_bond exists");
    accord::state::AppealBond::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn do_appeal(
    svm: &mut anchor_litesvm::AnchorContext,
    appellant: &Kp,
    appellant_ata: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
    prior_round: u32,
    mint: &Pubkey,
    vault: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let appeal_bond = appeal_bond_pda(dispute, prior_round);
    let ix = svm
        .program()
        .accounts(accounts::Appeal {
            appellant: appellant.pubkey(),
            subaccord: *subaccord,
            pause_state: pause_pda(),
            dispute: *dispute,
            round: *round,
            appeal_bond,
            staking_token: *mint,
            appellant_token_account: *appellant_ata,
            vault: *vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::Appeal {})
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[appellant])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("appeal failed: {:?}", r.logs()).into())
    }
}

fn do_claim_refund(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    claimant_ata: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    prior_round: u32,
    mint: &Pubkey,
    vault: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let appeal_bond = appeal_bond_pda(dispute, prior_round);
    let ix = svm
        .program()
        .accounts(accounts::ClaimAppealRefund {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            appeal_bond,
            staking_token: *mint,
            claimant_token_account: *claimant_ata,
            vault: *vault,
            token_program: spl_token::id(),
        })
        .args(instruction::ClaimAppealRefund {
            round_idx: prior_round,
        })
        .instruction()
        .unwrap();
    let r = svm.execute_instruction(ix, &[caller])?;
    if r.is_success() {
        Ok(())
    } else {
        Err(format!("claim_appeal_refund failed: {:?}", r.logs()).into())
    }
}

fn fund_appellant(w: &mut World, amt: u64) -> (Kp, Pubkey) {
    let appellant = w.svm.svm.create_funded_account(100_000_000_000).unwrap();
    let ata = w
        .svm
        .svm
        .create_associated_token_account(&w.mint, &appellant)
        .unwrap();
    w.svm.svm.mint_to(&w.mint, &ata, &w.creator, amt).unwrap();
    (appellant, ata)
}

// =========================================================================
// TESTS
// =========================================================================

#[test]
fn appeal_opens_new_round_at_2n_plus_1() {
    let mut w = world(3);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    assert_eq!(current_round(&w.svm, &w.dispute), 0);

    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let before_vault = token_balance(&w.svm, &vault);
    let before_appellant = token_balance(&w.svm, &appellant_ata);

    do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap();

    assert_eq!(current_round(&w.svm, &w.dispute), 1);
    assert_eq!(
        dispute_state(&w.svm, &w.dispute),
        DisputeState::Created,
        "appeal resets state to Created for the new round"
    );

    let bond_acc = read_appeal_bond(&w.svm, &appeal_bond_pda(&w.dispute, 0));
    assert_eq!(bond_acc.appellant, appellant.pubkey());
    assert_eq!(bond_acc.round_idx, 1);
    assert_eq!(bond_acc.amount, 7 * FEE_PER_JUROR);
    assert_eq!(bond_acc.prior_result, 0);

    let cost = 7 * FEE_PER_JUROR + 7 * FEE_PER_JUROR;
    assert_eq!(
        before_appellant - token_balance(&w.svm, &appellant_ata),
        cost
    );
    assert_eq!(token_balance(&w.svm, &vault) - before_vault, cost);

    let (round1, _) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
    let r1 = read_round(&w.svm, &round1);
    assert_eq!(r1.round_idx, 1);
    assert_eq!(r1.juror_count, 7, "panel sized at 2N+1 = 7");
    assert_eq!(r1.result, 1, "plurality is option 1");
}

#[test]
fn appeal_before_resolved_reverts() {
    let mut w = world(3);
    // Draw round 0 but do not finalize_round — state is Drawn.
    let r_idx = current_round(&w.svm, &w.dispute);
    let snap = snapshot_pda(&w.dispute, r_idx);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let poster_ata = w.poster_ata;
    post_snapshot(
        &mut w.svm,
        &w.poster,
        &w.subaccord,
        &w.dispute,
        &snap,
        &w.mint,
        &poster_ata,
        &vault,
        w.root,
        w.total_stake,
    );
    let snap_acc = {
        let acc = w.svm.svm.get_account(&snap).unwrap();
        accord::state::Snapshot::try_deserialize(&mut &acc.data[..]).unwrap()
    };
    warp_timestamp(&mut w.svm, snap_acc.challenge_deadline + 1);
    finalize_snapshot(
        &mut w.svm,
        &w.creator,
        &w.subaccord,
        &w.dispute,
        &snap,
        &w.mint,
        &poster_ata,
        &vault,
    );
    mock_commit_vrf(&mut w.svm, &w.dispute, COMMITTED_VRF);
    let panel = panel_for_round(r_idx) as usize;
    let (attempt, picks) = find_distinct_attempt(
        &w.sorted_claims,
        w.total_stake,
        &COMMITTED_VRF,
        &w.dispute,
        r_idx,
        panel,
    );
    let memberships: Vec<JurorMembership> = picks
        .iter()
        .map(|&si| JurorMembership {
            leaf: w.sorted_claims[si],
            proof: mst_proof(&w.levels, si),
            index: si as u32,
        })
        .collect();
    let pda_list: Vec<Pubkey> = picks
        .iter()
        .map(|&si| w.jurors[w.sorted_to_orig[si]].2)
        .collect();
    draw(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &snap,
        r_idx,
        attempt,
        memberships,
        &pda_list,
    );
    let round = round_pda(&w.dispute, r_idx);

    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let err = do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "appeal before RoundResolved must revert: {err}"
    );
}

#[test]
fn appeal_after_window_reverts() {
    let mut w = world(3);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    let r = read_round(&w.svm, &round0);
    warp_timestamp(&mut w.svm, r.reveal_end + APPEAL_WINDOW_SECS);

    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let err = do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "appeal after the appeal window must revert: {err}"
    );
}

#[test]
fn appeal_insufficient_jurors_reverts() {
    let mut w = small_world(3);
    let (round0, _) = resolve_round_small(&mut w, &[0, 0, 0]);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let err = do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "appeal with fewer stakers than the new panel must revert: {err}"
    );
}

#[test]
fn appeal_max_appeals_cap_zero() {
    let mut w = world(0);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let err = do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "appeal past max_appeals must revert: {err}"
    );
    assert_eq!(current_round(&w.svm, &w.dispute), 0, "no round opened");
}

#[test]
fn appeal_max_appeals_boundary() {
    let mut w = world(1);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap();
    assert_eq!(current_round(&w.svm, &w.dispute), 1);

    let (round1, _) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
    let err = do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round1,
        1,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "second appeal past max_appeals=1 must revert: {err}"
    );
}

#[test]
fn flip_returns_bond_to_appellant() {
    let mut w = world(3);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let bond = 7 * FEE_PER_JUROR;
    do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap();

    let (round1, juror_pdas1) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
    assert_eq!(read_round(&w.svm, &round1).result, 1);

    let r1 = read_round(&w.svm, &round1);
    warp_timestamp(&mut w.svm, r1.reveal_end + APPEAL_WINDOW_SECS);
    let bond_pdas = vec![appeal_bond_pda(&w.dispute, 0)];
    do_finalize_dispute(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round1,
        &juror_pdas1,
        &bond_pdas,
    )
    .unwrap();
    assert_eq!(dispute_state(&w.svm, &w.dispute), DisputeState::Final);
    let d = read_dispute(&w.svm, &w.dispute);
    assert_eq!(d.final_ruling, 1);
    assert_eq!(read_appeal_bond(&w.svm, &bond_pdas[0]).amount, bond);

    let before = token_balance(&w.svm, &appellant_ata);
    do_claim_refund(
        &mut w.svm,
        &w.caller,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        0,
        &w.mint,
        &vault,
    )
    .unwrap();
    assert_eq!(
        token_balance(&w.svm, &appellant_ata) - before,
        bond,
        "flipped bond returned in full"
    );
    let err = do_claim_refund(
        &mut w.svm,
        &w.caller,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "second claim must revert (bond already claimed): {err}"
    );

    for pda in juror_pdas1.iter() {
        let js_acc = w.svm.svm.get_account(pda).expect("juror_stake exists");
        JurorStake::try_deserialize(&mut &js_acc.data[..]).unwrap();
    }
}

#[test]
fn no_flip_forfeits_bond_to_coherent_pool() {
    let mut w = world(3);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    let bond = 7 * FEE_PER_JUROR;
    do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .unwrap();

    let (round1, juror_pdas1) = resolve_round(&mut w, &[0, 0, 0, 0, 1, 1, 1]);
    assert_eq!(read_round(&w.svm, &round1).result, 0);

    let r1 = read_round(&w.svm, &round1);
    warp_timestamp(&mut w.svm, r1.reveal_end + APPEAL_WINDOW_SECS);

    let coherent_pdas: Vec<Pubkey> = (0..4).map(|i| juror_pdas1[i]).collect();
    let coherent_before: Vec<u64> = coherent_pdas
        .iter()
        .map(|p| {
            let acc = w.svm.svm.get_account(p).unwrap();
            JurorStake::try_deserialize(&mut &acc.data[..])
                .unwrap()
                .amount
        })
        .collect();

    let bond_pdas = vec![appeal_bond_pda(&w.dispute, 0)];
    do_finalize_dispute(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round1,
        &juror_pdas1,
        &bond_pdas,
    )
    .unwrap();
    assert_eq!(dispute_state(&w.svm, &w.dispute), DisputeState::Final);
    assert_eq!(read_appeal_bond(&w.svm, &bond_pdas[0]).amount, 0);

    let slash_per_juror = (DEFAULT_ALPHA_BPS as u64) * MIN_STAKE / 10_000;
    let pool = 3 * slash_per_juror + 7 * FEE_PER_JUROR + bond;
    let share = pool / 4;
    for (i, pda) in coherent_pdas.iter().enumerate() {
        let acc = w.svm.svm.get_account(pda).unwrap();
        let amt = JurorStake::try_deserialize(&mut &acc.data[..])
            .unwrap()
            .amount;
        assert_eq!(
            amt - coherent_before[i],
            share,
            "coherent juror {i} receives the forfeited bond via the pool share"
        );
    }

    let before = token_balance(&w.svm, &appellant_ata);
    let err = do_claim_refund(
        &mut w.svm,
        &w.caller,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        0,
        &w.mint,
        &vault,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "no-flip claim must revert (bond already forfeited): {err}"
    );
    assert_eq!(
        token_balance(&w.svm, &appellant_ata),
        before,
        "no-flip appeal bond is not returned"
    );
}

// =========================================================================
// Split-scope pause (ADR-0013 / CONCEPT-REVIEW Ugly 2 / bean accord-hh61)
// =========================================================================
//
// `appeal` and `finalize_dispute` are NEVER pausable. A pause authority must
// not be able to suppress the right to appeal (and thereby pick which
// provisional rulings become final). Only `create_dispute` + `stake` (new
// exposure) are pausable; `unstake` was already never paused (ADR-0007).
//
// create_dispute/stake-still-revert-while-paused is covered by their own
// suites (create_dispute_litesvm.rs, stake_litesvm.rs), so these two tests
// cover the NEW contract: appeal + finalize proceed while paused.

#[test]
fn appeal_succeeds_while_paused() {
    let mut w = world(3);
    let (round0, _) = resolve_round(&mut w, &[0, 0, 0]);
    assert!(!is_paused(&w.svm));

    // Pause mid-dispute, inside the appeal window.
    do_pause(&mut w.svm, &w.creator);
    assert!(is_paused(&w.svm));

    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 100 * FEE_PER_JUROR);
    do_appeal(
        &mut w.svm,
        &appellant,
        &appellant_ata,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &w.mint,
        &vault,
    )
    .expect("appeal must succeed while paused (ADR-0013)");
    assert_eq!(current_round(&w.svm, &w.dispute), 1);
}

#[test]
fn finalize_dispute_proceeds_while_paused() {
    let mut w = world(0); // max_appeals=0: single round, no appeal possible
    let (round0, juror_pdas) = resolve_round(&mut w, &[0, 0, 0]);

    // Past the appeal window so finalize_dispute is eligible, then pause.
    let r = read_round(&w.svm, &round0);
    warp_timestamp(&mut w.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    do_pause(&mut w.svm, &w.creator);
    assert!(is_paused(&w.svm));

    do_finalize_dispute(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        &juror_pdas,
        &[],
    )
    .expect("finalize_dispute must proceed while paused (ADR-0013)");
    assert_eq!(dispute_state(&w.svm, &w.dispute), DisputeState::Final);
}
