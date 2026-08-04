#![cfg(feature = "no-entrypoint")]
//! `draw` tests (veridao-fr1x). LiteSVM exercises the ADR-0003/0009 juror draw:
//! committed VRF consumption, Merkle-Sum-Tree membership verification, sortition
//! enforcement, stake eligibility, distinctness, and the `active_draws` freeze.
//!
//! Run via `make test_unit`.

use accord::constants::{
    DEFAULT_ALPHA_BPS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_ROUND, SEED_SNAPSHOT,
    SEED_SUBACCORD,
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
type HashSum = ([u8; 32], u64);

// --- Merkle-Sum Tree helpers (match the on-chain MST verifier) ---

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

/// Deterministic VRF seed (must match the on-chain computation exactly).
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

/// Which sorted-claim index does r_i land in for each panel slot?
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

/// Find a draw_attempt whose sortition gives `panel` distinct jurors.
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

/// Find a draw_attempt whose sortition produces a collision (for DuplicateJuror test).
fn find_collision_attempt(
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
        if unique.len() < panel {
            return (attempt, picks);
        }
    }
    panic!("no collision draw_attempt found in 10k tries");
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
    /// Claims sorted by juror pubkey ascending (as the MST requires).
    sorted_claims: Vec<LeafClaim>,
    /// sorted_idx → original jurors[] index.
    sorted_to_orig: Vec<usize>,
    levels: Vec<Vec<HashSum>>,
    root: [u8; 32],
    total_stake: u64,
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

    // Sort jurors by pubkey ascending and build LeafClaims with cum_after.
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

    // Commit the VRF (required before draw).
    commit_vrf(
        &mut svm,
        &caller,
        &subaccord,
        &dispute,
        &snapshot,
        COMMITTED_VRF,
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
        sorted_claims,
        sorted_to_orig: order,
        levels,
        root,
        total_stake,
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

// --- membership / PDA helpers operating on the Fixture's sorted claims ---

fn membership_for(fx: &Fixture, sorted_idx: usize) -> JurorMembership {
    JurorMembership {
        leaf: fx.sorted_claims[sorted_idx],
        proof: mst_proof(&fx.levels, sorted_idx),
        index: sorted_idx as u32,
    }
}
fn juror_pda_for(fx: &Fixture, sorted_idx: usize) -> Pubkey {
    fx.jurors[fx.sorted_to_orig[sorted_idx]].2
}

/// Build a draw instruction against fx.dispute / fx.snapshot.
fn draw_ix(
    fx: &Fixture,
    caller: &Pubkey,
    dispute: &Pubkey,
    snapshot: &Pubkey,
    draw_attempt: u32,
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
        .accounts(accounts::Draw {
            caller: *caller,
            subaccord: fx.subaccord,
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

    let (attempt, picks) = find_distinct_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();

    for &si in &picks {
        assert_eq!(
            read_juror_stake(&fx.svm, &juror_pda_for(&fx, si)).active_draws,
            0
        );
    }

    fx.svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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
    for (i, &si) in picks.iter().enumerate() {
        assert_eq!(round.jurors[i], fx.sorted_claims[si].juror);
    }

    for &si in &picks {
        assert_eq!(
            read_juror_stake(&fx.svm, &juror_pda_for(&fx, si)).active_draws,
            1,
            "drawn juror active_draws incremented"
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
        fx.total_stake,
    );

    // No commit_vrf for this dispute → draw reverts (SnapshotNotFinalized fires
    // first since the second snapshot was never finalized).
    let memberships = vec![
        membership_for(&fx, 0),
        membership_for(&fx, 1),
        membership_for(&fx, 2),
    ];
    let pda_list: Vec<Pubkey> = (0..3).map(|si| juror_pda_for(&fx, si)).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &dispute2,
                &snapshot2,
                0,
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

    let (attempt, picks) = find_distinct_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let mut memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    // Tamper: swap proof of first membership with the second's.
    memberships[0].proof = memberships[1].proof.clone();
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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

    // Find a draw_attempt whose sortition naturally produces a collision.
    let (attempt, picks) = find_collision_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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

    let memberships = vec![membership_for(&fx, 0), membership_for(&fx, 1)];
    let pda_list = vec![juror_pda_for(&fx, 0), juror_pda_for(&fx, 1)];

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                0,
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

    let (attempt, picks) = find_distinct_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let mut memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    memberships[0].leaf.stake = 1; // below MIN_STAKE
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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

    let (attempt, picks) = find_distinct_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    // Build correct PDAs then swap two to create a mismatch.
    let mut pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();
    pda_list.swap(1, 2);

    let r = fx
        .svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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
    let attempt: u32 = 0;
    let expected = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &attempt.to_le_bytes(),
    ])
    .to_bytes();

    let again = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &attempt.to_le_bytes(),
    ])
    .to_bytes();
    assert_eq!(expected, again);

    let other = hashv(&[
        [43u8; 32].as_ref(),
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &attempt.to_le_bytes(),
    ])
    .to_bytes();
    assert_ne!(expected, other, "different VRF must produce different seed");
}

#[test]
fn double_draw_reverts() {
    let mut fx = setup();

    let (attempt, picks) = find_distinct_attempt(
        &fx.sorted_claims,
        fx.total_stake,
        &COMMITTED_VRF,
        &fx.dispute,
        0,
        JURORS_PER_DISPUTE as usize,
    );
    let memberships: Vec<JurorMembership> =
        picks.iter().map(|&si| membership_for(&fx, si)).collect();
    let pda_list: Vec<Pubkey> = picks.iter().map(|&si| juror_pda_for(&fx, si)).collect();

    // First draw succeeds.
    fx.svm
        .execute_instruction(
            draw_ix(
                &fx,
                &fx.caller.pubkey(),
                &fx.dispute,
                &fx.snapshot,
                attempt,
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
                attempt,
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
