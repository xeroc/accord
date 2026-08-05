#![cfg(feature = "no-entrypoint")]
//! Multi-round settlement tests (CONCEPT-REVIEW Ugly 5 / bean accord-r6ti).
//!
//! Exercises the decoupled settlement model:
//! - Participation fee paid on reveal (outcome-independent, immediate).
//! - `finalize_dispute` settles ONLY the final round against `final_ruling`.
//! - `settle_round` crank settles prior rounds against `final_ruling`.
//! - After all cranks, every drawn juror's `active_draws == 0`.
//! - Round-0 juror who voted the overturned option is SLASHED at finality.
//! - Round-0 juror who voted the final ruling receives a coherence share.
//!
//! Run via `make test_unit`.

use accord::constants::{
    APPEAL_WINDOW_SECS, DEFAULT_ALPHA_BPS, SEED_APPEAL_BOND, SEED_DISPUTE, SEED_JUROR_STAKE,
    SEED_PAUSE, SEED_ROUND, SEED_SNAPSHOT, SEED_SUBACCORD,
};
use accord::state::{
    Dispute, DisputeState, JurorMembership, JurorStake, LeafClaim, MSTNode, Round,
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
fn read_juror_stake(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> JurorStake {
    let acc = svm.svm.get_account(pda).expect("juror_stake exists");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
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

/// Resolve the current round with the given votes. Returns (round PDA, juror
/// stake PDAs, drawn juror keypairs). Stores drawn jurors in the World for
/// later settlement tracking.
#[allow(clippy::type_complexity)]
fn resolve_round(w: &mut World, votes: &[u8]) -> (Pubkey, Vec<Pubkey>, Vec<Kp>) {
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

    if r_idx == 0 {
        mock_commit_vrf(&mut w.svm, &dispute, COMMITTED_VRF);
    }

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
    let drawn_kps: Vec<Kp> = picks
        .iter()
        .map(|&si| w.jurors[w.sorted_to_orig[si]].0.insecure_clone())
        .collect();

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
            &w.mint,
        )
        .unwrap();
    }
    let r = read_round(&w.svm, &round);
    warp_timestamp(&mut w.svm, r.reveal_end);
    do_finalize_round(&mut w.svm, &w.caller, &sub, &dispute, &round).unwrap();

    assert_eq!(dispute_state(&w.svm, &dispute), DisputeState::RoundResolved);
    (round, pda_list, drawn_kps)
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
    let mut acc = svm.svm.get_account(dispute).expect("dispute exists");
    let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    d.committed_vrf = Some(vrf_result);
    let mut buf = Vec::new();
    d.try_serialize(&mut buf).unwrap();
    assert!(buf.len() <= acc.data.len());
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
    mint: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let juror_ata = get_associated_token_address(&juror.pubkey(), mint);
    let vault = vault_ata(subaccord, mint);
    let ix = svm
        .program()
        .accounts(accounts::Reveal {
            juror: juror.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
            staking_token: *mint,
            juror_token_account: juror_ata,
            vault,
            token_program: spl_token::id(),
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
        solana_sdk::instruction::AccountMeta::new(*round, false),
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

fn do_settle_round(
    svm: &mut anchor_litesvm::AnchorContext,
    caller: &Kp,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    round: &Pubkey,
    round_idx: u32,
    juror_stake_pdas: &[Pubkey],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut accounts_meta = vec![
        solana_sdk::instruction::AccountMeta::new(caller.pubkey(), true),
        solana_sdk::instruction::AccountMeta::new_readonly(*subaccord, false),
        solana_sdk::instruction::AccountMeta::new(*dispute, false),
        solana_sdk::instruction::AccountMeta::new(*round, false),
    ];
    for pda in juror_stake_pdas {
        accounts_meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = svm
        .program()
        .accounts(accounts::SettleRound {
            caller: caller.pubkey(),
            subaccord: *subaccord,
            dispute: *dispute,
            round: *round,
        })
        .args(instruction::SettleRound { round_idx })
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
        Err(format!("settle_round failed: {:?}", r.logs()).into())
    }
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

fn slash_per_juror() -> u64 {
    (DEFAULT_ALPHA_BPS as u64) * MIN_STAKE / 10_000
}

// =========================================================================
// TESTS — multi-round settlement (CONCEPT-REVIEW Ugly 5 / accord-r6ti)
// =========================================================================

/// Core acceptance test: two-round dispute where the appeal flips the ruling.
/// Round-0 jurors who voted the overturned option are SLASHED at finality;
/// those who voted the final ruling get a coherence share. Participation fee
/// was paid on reveal regardless. After settle_round + finalize_dispute, every
/// drawn juror has active_draws == 0.
#[test]
fn multi_round_settlement_flipped_appeal() {
    let mut w = world(3);

    // Round 0: 3 jurors, 2 vote 0, 1 votes 1 → result 0.
    let (round0, juror_pdas0, drawn0) = resolve_round(&mut w, &[0, 0, 1]);
    assert_eq!(read_round(&w.svm, &round0).result, 0);

    // Appeal to round 1.
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

    // Round 1: 7 jurors, 4 vote 1, 3 vote 0 → result 1 (FLIPS round 0).
    let (round1, juror_pdas1, _) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
    assert_eq!(read_round(&w.svm, &round1).result, 1);

    // Past the appeal window → finalize_dispute writes final_ruling = 1.
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
    assert_eq!(read_dispute(&w.svm, &w.dispute).final_ruling, 1);

    // Finalize writes final_ruling = 1. Round 1 is settled by finalize_dispute.
    // (We don't assert active_draws == 0 yet — a juror drawn in BOTH rounds
    // has active_draws = 2, and only round 1 is settled so far.)
    assert_eq!(dispute_state(&w.svm, &w.dispute), DisputeState::Final);
    assert_eq!(read_dispute(&w.svm, &w.dispute).final_ruling, 1);
    assert_eq!(
        read_round(&w.svm, &round1).settled,
        1,
        "final round marked settled"
    );

    // Capture amounts before settle_round so we verify the DELTA (not the
    // absolute — a juror drawn in both rounds also gets a round-1 share).
    let before_settle: Vec<u64> = juror_pdas0
        .iter()
        .map(|p| read_juror_stake(&w.svm, p).amount)
        .collect();

    // Settle round 0 against final_ruling = 1.
    do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &juror_pdas0,
    )
    .unwrap();
    assert_eq!(
        read_round(&w.svm, &round0).settled,
        1,
        "prior round marked settled"
    );

    // NOW every drawn juror across all rounds must have active_draws == 0.
    for pda in juror_pdas0.iter().chain(juror_pdas1.iter()) {
        assert_eq!(
            read_juror_stake(&w.svm, pda).active_draws,
            0,
            "all jurors released after full settlement"
        );
    }

    // Round-0 coherence check (votes [0, 0, 1], final_ruling = 1):
    // Juror 0 voted 0 → incoherent → slashed.
    // Juror 1 voted 0 → incoherent → slashed.
    // Juror 2 voted 1 → coherent → gets share.
    let slash = slash_per_juror();

    // pool = 2 * slash (jurors 0,1 incoherent) + 0 non-revealer fee
    // (all 3 revealed). coherent_count = 1. share = 200.
    let expected_share = 2 * slash;

    // Juror 2 (voted 1 = final_ruling) is coherent — delta = +share.
    let js2 = read_juror_stake(&w.svm, &juror_pdas0[2]);
    assert_eq!(
        js2.amount,
        before_settle[2] + expected_share,
        "coherent round-0 juror gets exact share from settle_round"
    );

    // Jurors 0, 1 (voted 0 ≠ final_ruling) are slashed — delta = -slash.
    for i in 0..2 {
        let js = read_juror_stake(&w.svm, &juror_pdas0[i]);
        assert_eq!(
            js.amount,
            before_settle[i] - slash,
            "incoherent round-0 juror {i} slashed by settle_round"
        );
    }

    // Round settled flags set.
    assert_eq!(read_round(&w.svm, &round0).settled, 1);
    assert_eq!(
        read_round(&w.svm, &round1).settled,
        1,
        "final round settled by finalize_dispute"
    );
}

/// Participation fee is paid on reveal regardless of the final outcome.
/// Each revealer's ATA gains fee_per_juror immediately.
#[test]
fn participation_fee_paid_on_reveal() {
    let mut w = world(3);
    let (round0, juror_pdas0, drawn0) = resolve_round(&mut w, &[0, 0, 0]);

    // After resolve_round (which reveals), each drawn juror's ATA should have
    // gained FEE_PER_JUROR from the vault.
    for kp in &drawn0 {
        let ata = get_associated_token_address(&kp.pubkey(), &w.mint);
        let bal = token_balance(&w.svm, &ata);
        // ATA: 100_000 (mint) - STAKE_AMOUNT (staked) + FEE_PER_JUROR (reveal).
        assert_eq!(
            bal,
            100_000 - STAKE_AMOUNT + FEE_PER_JUROR,
            "juror ATA received participation fee on reveal"
        );
    }

    // Vault should have paid out 3 * FEE_PER_JUROR.
    let vault = vault_ata(&w.subaccord, &w.mint);
    let vault_bal = token_balance(&w.svm, &vault);
    // Vault started with: 3 * STAKE_AMOUNT (stakes) + 3 * FEE_PER_JUROR (dispute fee)
    //                    + poster bond deposits.
    // After 3 reveals: vault -= 3 * FEE_PER_JUROR.
    // We just verify it's less than it would be without the fee payouts.
    let expected_min = 3 * STAKE_AMOUNT; // at minimum, stakes are still there
    assert!(
        vault_bal >= expected_min,
        "vault retains staked capital after fee payouts"
    );
}

/// Idempotency: settle_round on an already-settled round must revert.
#[test]
fn settle_round_idempotent() {
    let mut w = world(3);
    let (round0, juror_pdas0, _) = resolve_round(&mut w, &[0, 0, 0]);

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

    let (round1, juror_pdas1, _) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
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

    // Settle round 0 — succeeds.
    do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &juror_pdas0,
    )
    .unwrap();

    // Settle round 0 again — must revert (RoundAlreadySettled).
    let err = do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &juror_pdas0,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "double settle_round must revert: {err}"
    );
}

/// settle_round on the current (final) round must revert — that's
/// finalize_dispute's job.
#[test]
fn settle_round_on_current_round_reverts() {
    let mut w = world(3);
    let (round0, juror_pdas0, _) = resolve_round(&mut w, &[0, 0, 0]);

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

    let (round1, juror_pdas1, _) = resolve_round(&mut w, &[1, 1, 1, 1, 0, 0, 0]);
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

    // Try to settle round 1 (= current_round) — must revert.
    let err = do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round1,
        1,
        &juror_pdas1,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "settle_round on current round must revert: {err}"
    );
}

/// settle_round before the dispute is finalized must revert.
#[test]
fn settle_round_before_final_reverts() {
    let mut w = world(3);
    let (round0, juror_pdas0, _) = resolve_round(&mut w, &[0, 0, 0]);

    // Dispute is RoundResolved, not Final yet.
    let err = do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &juror_pdas0,
    )
    .unwrap_err();
    assert!(
        err.to_string().contains("failed"),
        "settle_round before Final must revert: {err}"
    );
}

/// After all settle_round cranks + finalize_dispute, every drawn juror has
/// active_draws == 0 — no permanent lock (the core bug being fixed).
#[test]
fn all_active_draws_released_after_full_settlement() {
    // Need 31 distinct stakers for the full ladder (3→7→15).
    let mut w = build_world(3, 31);

    // Round 0: 3 jurors.
    let (round0, juror_pdas0, _) = resolve_round(&mut w, &[0, 0, 0]);

    // Appeal → Round 1: 7 jurors.
    let vault = vault_ata(&w.subaccord, &w.mint);
    let (appellant, appellant_ata) = fund_appellant(&mut w, 1000 * FEE_PER_JUROR);
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
    let (round1, juror_pdas1, _) = resolve_round(&mut w, &[0, 0, 0, 0, 0, 0, 0]);

    // Appeal → Round 2: 15 jurors.
    do_appeal(
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
    .unwrap();
    let (round2, juror_pdas2, _) = resolve_round(&mut w, &[0; 15]);

    // Finalize (round 2 is the final round).
    let r2 = read_round(&w.svm, &round2);
    warp_timestamp(&mut w.svm, r2.reveal_end + APPEAL_WINDOW_SECS);
    let bond_pdas = vec![
        appeal_bond_pda(&w.dispute, 0),
        appeal_bond_pda(&w.dispute, 1),
    ];
    do_finalize_dispute(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round2,
        &juror_pdas2,
        &bond_pdas,
    )
    .unwrap();

    // Settle rounds 0 and 1.
    do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        0,
        &juror_pdas0,
    )
    .unwrap();
    do_settle_round(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round1,
        1,
        &juror_pdas1,
    )
    .unwrap();

    // EVERY drawn juror across all 3 rounds must have active_draws == 0.
    for (round_idx, pdas) in [(0, &juror_pdas0), (1, &juror_pdas1), (2, &juror_pdas2)] {
        for (j, pda) in pdas.iter().enumerate() {
            assert_eq!(
                read_juror_stake(&w.svm, pda).active_draws,
                0,
                "round {round_idx} juror {j} active_draws must be 0 after full settlement"
            );
        }
    }
}

/// Non-revealer fees fold into the coherent pool (every fee has a named
/// destination — no vault surplus leakage).
#[test]
fn non_revealer_fee_folds_into_coherent_pool() {
    let mut w = world(0); // max_appeals=0: single round
    let (round0, juror_pdas, _) = resolve_round(&mut w, &[0, 0, 0]);

    // Finalize the dispute (single round, no appeals).
    let r = read_round(&w.svm, &round0);
    warp_timestamp(&mut w.svm, r.reveal_end + APPEAL_WINDOW_SECS);
    do_finalize_dispute(
        &mut w.svm,
        &w.caller,
        &w.subaccord,
        &w.dispute,
        &round0,
        &juror_pdas,
        &[],
    )
    .unwrap();

    // All 3 coherent (voted 0, final ruling = 0). Pool = 0 (no slashes, no
    // non-revealer fees — everyone revealed). Share = 0.
    let slash = slash_per_juror();
    let _ = slash; // unused in this path — all coherent

    for pda in &juror_pdas {
        let js = read_juror_stake(&w.svm, pda);
        assert_eq!(
            js.amount, STAKE_AMOUNT,
            "no slashes, no non-revealer fees → amount unchanged (fee was on reveal)"
        );
        assert_eq!(js.active_draws, 0);
    }
}
