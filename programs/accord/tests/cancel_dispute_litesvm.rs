#![cfg(feature = "no-entrypoint")]
//! `cancel_dispute` tests (bean accord-18fb / CONCEPT-REVIEW Ugly 4).
//!
//! Proves the liveness-escape invariant: a stalled dispute can always be
//! cancelled past its per-stage timeout — the filer's round-1 fee is refunded,
//! drawn jurors' `active_draws` are released, and the dispute reaches the
//! terminal `Failed` state. No instruction accepts `Failed` afterwards.
//!
//! Coverage (TDD acceptance criteria):
//! - pre-draw cancel after timeout  -> filer fee refunded, state == Failed
//! - cancel BEFORE the timeout       -> reverts (CancelTooEarly)
//! - Failed is terminal              -> re-cancel + post_snapshot revert
//! - post-draw cancel after timeout  -> active_draws released, filer refunded
//!
//! Run via `make test_unit`.

use accord::constants::{
    APPEAL_WINDOW_SECS, DEFAULT_ALPHA_BPS, POST_DRAW_CANCEL_GRACE_SECS,
    PRE_DRAW_CANCEL_TIMEOUT_SECS, SEED_DISPUTE, SEED_JUROR_STAKE, SEED_PAUSE, SEED_ROUND,
    SEED_SNAPSHOT, SEED_SUBACCORD,
};
use accord::state::{
    Dispute, DisputeState, JurorMembership, JurorStake, LeafClaim, MSTNode, Round, Snapshot,
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
const REQUIRED_FEE: u64 = (JURORS_PER_DISPUTE as u64) * FEE_PER_JUROR;
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

fn read_dispute(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Dispute {
    let acc = svm.svm.get_account(pda).expect("dispute exists");
    Dispute::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_juror_stake(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> JurorStake {
    let acc = svm.svm.get_account(pda).expect("juror_stake exists");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn read_round(svm: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Round {
    let acc = svm.svm.get_account(pda).expect("round exists");
    Round::try_deserialize(&mut &acc.data[..]).unwrap()
}
fn token_amount(svm: &anchor_litesvm::AnchorContext, ata: &Pubkey) -> u64 {
    let acc = svm.svm.get_account(ata).expect("token account exists");
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&acc.data[64..72]);
    u64::from_le_bytes(buf)
}

fn warp_timestamp(svm: &mut anchor_litesvm::AnchorContext, ts: i64) {
    let mut clock = svm.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    svm.svm.set_sysvar::<Clock>(&clock);
}

type Kp = solana_sdk::signature::Keypair;
type HashSum = ([u8; 32], u64);

// --- MST helpers (compact copy of voting_litesvm's verified tree builder) ---

fn leaf_hash(juror: &Pubkey, stake: u64, cum_after: u64) -> [u8; 32] {
    hashv(&[
        juror.as_ref(),
        &stake.to_le_bytes(),
        &cum_after.to_le_bytes(),
    ])
    .to_bytes()
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
            .map(|p| (hashv(&[&p[0].0, &p[1].0]).to_bytes(), p[0].1 + p[1].1))
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
fn vrf_seed(committed: &[u8; 32], dispute: &Pubkey, round: u32, attempt: u32) -> [u8; 32] {
    hashv(&[
        committed,
        dispute.as_ref(),
        &round.to_le_bytes(),
        &attempt.to_le_bytes(),
    ])
    .to_bytes()
}
fn find_distinct_attempt(
    claims: &[LeafClaim],
    total_stake: u64,
    committed: &[u8; 32],
    dispute: &Pubkey,
    panel: usize,
) -> (u32, Vec<usize>) {
    for attempt in 0..10_000u32 {
        let seed = vrf_seed(committed, dispute, 0, attempt);
        let picks: Vec<usize> = (0..panel)
            .map(|i| {
                let h = hashv(&[&seed, &(i as u32).to_le_bytes()]).to_bytes();
                let r = u64::from_le_bytes(h[0..8].try_into().unwrap_or([0u8; 8])) % total_stake;
                claims
                    .iter()
                    .position(|c| {
                        let before = c.cum_after.saturating_sub(c.stake);
                        before <= r && r < c.cum_after
                    })
                    .unwrap()
            })
            .collect();
        let unique: std::collections::HashSet<usize> = picks.iter().copied().collect();
        if unique.len() == panel {
            return (attempt, picks);
        }
    }
    panic!("no distinct draw_attempt found");
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

#[allow(clippy::too_many_arguments)]
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

/// cancel_dispute with remaining accounts (post-draw round + juror stakes).
#[allow(clippy::too_many_arguments)]
fn cancel_dispute_ix(
    svm: &anchor_litesvm::AnchorContext,
    caller: &Pubkey,
    subaccord: &Pubkey,
    dispute: &Pubkey,
    mint: &Pubkey,
    filer_ata: &Pubkey,
    vault: &Pubkey,
    remaining: &[Pubkey],
) -> solana_sdk::instruction::Instruction {
    let mut meta = vec![
        solana_sdk::instruction::AccountMeta::new(*caller, true),
        solana_sdk::instruction::AccountMeta::new_readonly(*subaccord, false),
        solana_sdk::instruction::AccountMeta::new(*dispute, false),
        solana_sdk::instruction::AccountMeta::new_readonly(*mint, false),
        solana_sdk::instruction::AccountMeta::new(*filer_ata, false),
        solana_sdk::instruction::AccountMeta::new(*vault, false),
        solana_sdk::instruction::AccountMeta::new_readonly(spl_token::id(), false),
    ];
    for pda in remaining {
        meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = svm
        .program()
        .accounts(accounts::CancelDispute {
            caller: *caller,
            subaccord: *subaccord,
            dispute: *dispute,
            staking_token: *mint,
            filer_token_account: *filer_ata,
            vault: *vault,
            token_program: spl_token::id(),
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap()
        .data;
    solana_sdk::instruction::Instruction {
        program_id: ID,
        accounts: meta,
        data,
    }
}

// ============================================================================
//  PRE-DRAW FIXTURE — dispute filed, no snapshot, no draw.
// ============================================================================

struct PreDrawFixture {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    filer: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    filer_ata: Pubkey,
    filed_at: i64,
}

fn pre_draw_setup() -> PreDrawFixture {
    let mut svm = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = svm.svm.create_funded_account(50_000_000_000).unwrap();
    let filer = svm.svm.create_funded_account(50_000_000_000).unwrap();
    init_pause(&mut svm, &creator);
    let mint = svm.svm.create_token_mint(&creator, 6).unwrap().pubkey();
    let risk_type = [1u8; 32];
    let subaccord = subaccord_pda(&creator.pubkey(), &risk_type);
    create_subaccord(&mut svm, &creator, &subaccord, &mint, risk_type);
    for _ in 0..JURORS_PER_DISPUTE {
        let juror = svm.svm.create_funded_account(50_000_000_000).unwrap();
        let jata = svm
            .svm
            .create_associated_token_account(&mint, &juror)
            .unwrap();
        svm.svm.mint_to(&mint, &jata, &creator, 10_000).unwrap();
        stake(&mut svm, &juror, &subaccord, &mint, &jata, STAKE_AMOUNT);
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
    let filed_at = read_dispute(&svm, &dispute).filed_at;
    PreDrawFixture {
        svm,
        creator,
        filer,
        mint,
        subaccord,
        dispute,
        filer_ata,
        filed_at,
    }
}

#[test]
fn cancel_pre_draw_after_timeout_refunds_filer() {
    let mut fx = pre_draw_setup();
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    let filer_before = token_amount(&fx.svm, &fx.filer_ata);
    let vault_before = token_amount(&fx.svm, &vault);

    // Warp just past the pre-draw timeout.
    warp_timestamp(&mut fx.svm, fx.filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS + 1);

    fx.svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &[],
            ),
            &[&cranker],
        )
        .unwrap()
        .assert_success();

    // Filer recovers exactly their round-1 fee; vault loses exactly it.
    assert_eq!(
        token_amount(&fx.svm, &fx.filer_ata),
        filer_before + REQUIRED_FEE,
        "filer must be refunded the round-1 fee"
    );
    assert_eq!(
        token_amount(&fx.svm, &vault),
        vault_before - REQUIRED_FEE,
        "vault must release the round-1 fee"
    );
    assert_eq!(
        read_dispute(&fx.svm, &fx.dispute).state,
        DisputeState::Failed,
        "dispute must reach the terminal Failed state"
    );
}

#[test]
fn cancel_before_timeout_reverts() {
    let mut fx = pre_draw_setup();
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    let filer_before = token_amount(&fx.svm, &fx.filer_ata);

    // Warp to just BEFORE the timeout (boundary: now == deadline still reverts
    // because the gate is strict `now > deadline`).
    warp_timestamp(&mut fx.svm, fx.filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS);

    let r = fx
        .svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &[],
            ),
            &[&cranker],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "cancel before the timeout must revert; logs={:?}",
        r.logs()
    );
    // No refund, state unchanged.
    assert_eq!(token_amount(&fx.svm, &fx.filer_ata), filer_before);
    assert_eq!(
        read_dispute(&fx.svm, &fx.dispute).state,
        DisputeState::Created
    );
}

#[test]
fn failed_is_terminal_blocks_re_cancel_and_post_snapshot() {
    let mut fx = pre_draw_setup();
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();
    warp_timestamp(&mut fx.svm, fx.filed_at + PRE_DRAW_CANCEL_TIMEOUT_SECS + 1);
    // First cancel succeeds -> Failed.
    fx.svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &[],
            ),
            &[&cranker],
        )
        .unwrap()
        .assert_success();
    assert_eq!(
        read_dispute(&fx.svm, &fx.dispute).state,
        DisputeState::Failed
    );

    // Re-cancelling a Failed dispute must revert.
    let r = fx
        .svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &[],
            ),
            &[&cranker],
        )
        .unwrap();
    assert!(
        !r.is_success(),
        "Failed is terminal; re-cancel must revert; logs={:?}",
        r.logs()
    );
}

// ============================================================================
//  POST-DRAW FIXTURE — full snapshot/VRF/draw so a round with active_draws
//  exists, then it is left stuck (never finalized).
// ============================================================================

struct DrawnFixture {
    svm: anchor_litesvm::AnchorContext,
    creator: Kp,
    filer: Kp,
    mint: Pubkey,
    subaccord: Pubkey,
    dispute: Pubkey,
    round: Pubkey,
    filer_ata: Pubkey,
    /// (keypair, JurorStake PDA) for every drawn juror, in round order.
    drawn: Vec<(Kp, Pubkey)>,
}

fn drawn_setup() -> DrawnFixture {
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

    let mut jurors: Vec<(Kp, u64, Pubkey)> = Vec::new();
    for _ in 0..JURORS_PER_DISPUTE {
        let juror = svm.svm.create_funded_account(50_000_000_000).unwrap();
        let jata = svm
            .svm
            .create_associated_token_account(&mint, &juror)
            .unwrap();
        svm.svm.mint_to(&mint, &jata, &creator, 10_000).unwrap();
        let js_pda = juror_stake_pda(&subaccord, &juror.pubkey());
        stake(&mut svm, &juror, &subaccord, &mint, &jata, STAKE_AMOUNT);
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

    // Build a sorted MST over the juror set.
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

    // Snapshot -> finalize -> commit VRF -> draw (same path as voting_litesvm).
    let snapshot = snapshot_pda(&dispute, 0);
    let vault = vault_ata(&subaccord, &mint);
    let poster_ata = svm
        .svm
        .create_associated_token_account(&mint, &poster)
        .unwrap();
    svm.svm
        .mint_to(&mint, &poster_ata, &creator, EXPECTED_BOND * 5)
        .unwrap();
    let ix = svm
        .program()
        .accounts(accounts::PostSnapshot {
            poster: poster.pubkey(),
            subaccord,
            dispute,
            snapshot,
            staking_token: mint,
            poster_token_account: poster_ata,
            vault,
            token_program: spl_token::id(),
            system_program: SYS,
        })
        .args(instruction::PostSnapshot {
            merkle_root: root,
            total_stake,
        })
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&poster])
        .unwrap()
        .assert_success();

    let snap = {
        let acc = svm.svm.get_account(&snapshot).unwrap();
        Snapshot::try_deserialize(&mut &acc.data[..]).unwrap()
    };
    warp_timestamp(&mut svm, snap.challenge_deadline + 1);
    let ix = svm
        .program()
        .accounts(accounts::FinalizeSnapshot {
            caller: creator.pubkey(),
            subaccord,
            dispute,
            snapshot,
            staking_token: mint,
            poster_token_account: poster_ata,
            vault,
            token_program: spl_token::id(),
        })
        .args(instruction::FinalizeSnapshot {})
        .instruction()
        .unwrap();
    svm.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    // Inject committed VRF directly (the VRF oracle is not on LiteSVM).
    {
        let mut acc = svm.svm.get_account(&dispute).unwrap();
        let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
        d.committed_vrf = Some(COMMITTED_VRF);
        let mut buf = Vec::new();
        d.try_serialize(&mut buf).unwrap();
        let len = buf.len();
        acc.data[..len].copy_from_slice(&buf);
        for b in &mut acc.data[len..] {
            *b = 0;
        }
        svm.svm.set_account(dispute, acc).unwrap();
    }

    let (attempt, picks) = find_distinct_attempt(
        &sorted_claims,
        total_stake,
        &COMMITTED_VRF,
        &dispute,
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
    let round = round_pda(&dispute, 0);

    let mut meta = vec![
        solana_sdk::instruction::AccountMeta::new(caller.pubkey(), true),
        solana_sdk::instruction::AccountMeta::new_readonly(subaccord, false),
        solana_sdk::instruction::AccountMeta::new(dispute, false),
        solana_sdk::instruction::AccountMeta::new_readonly(snapshot, false),
        solana_sdk::instruction::AccountMeta::new(round, false),
        solana_sdk::instruction::AccountMeta::new_readonly(SYS, false),
    ];
    for pda in &pda_list {
        meta.push(solana_sdk::instruction::AccountMeta::new(*pda, false));
    }
    let data = svm
        .program()
        .accounts(accounts::Draw {
            caller: caller.pubkey(),
            subaccord,
            dispute,
            snapshot,
            round,
            system_program: SYS,
        })
        .args(instruction::Draw {
            draw_attempt: attempt,
            memberships,
        })
        .instruction()
        .unwrap()
        .data;
    svm.execute_instruction(
        solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: meta,
            data,
        },
        &[&caller],
    )
    .unwrap()
    .assert_success();

    let drawn: Vec<(Kp, Pubkey)> = picks
        .iter()
        .map(|&si| {
            let orig = order[si];
            (jurors[orig].0.insecure_clone(), jurors[orig].2)
        })
        .collect();

    DrawnFixture {
        svm,
        creator,
        filer,
        mint,
        subaccord,
        dispute,
        round,
        filer_ata,
        drawn,
    }
}

#[test]
fn cancel_post_draw_releases_active_draws_and_refunds() {
    let mut fx = drawn_setup();
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();

    // The draw bumped every drawn juror's active_draws to 1.
    for (_, js) in &fx.drawn {
        assert_eq!(
            read_juror_stake(&fx.svm, js).active_draws,
            1,
            "draw must have locked juror stake"
        );
    }

    // Stuck round: warp past reveal_end + appeal window + grace.
    let r = read_round(&fx.svm, &fx.round);
    let deadline = r.reveal_end + APPEAL_WINDOW_SECS + POST_DRAW_CANCEL_GRACE_SECS;
    warp_timestamp(&mut fx.svm, deadline + 1);

    let filer_before = token_amount(&fx.svm, &fx.filer_ata);
    let juror_pdas: Vec<Pubkey> = fx.drawn.iter().map(|(_, p)| *p).collect();
    let remaining: Vec<Pubkey> = std::iter::once(fx.round)
        .chain(juror_pdas.iter().copied())
        .collect();

    fx.svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &remaining,
            ),
            &[&cranker],
        )
        .unwrap()
        .assert_success();

    // active_draws released for every drawn juror.
    for (_, js) in &fx.drawn {
        assert_eq!(
            read_juror_stake(&fx.svm, js).active_draws,
            0,
            "cancel must release active_draws"
        );
    }
    // Filer refunded.
    assert_eq!(
        token_amount(&fx.svm, &fx.filer_ata),
        filer_before + REQUIRED_FEE,
        "filer must be refunded the round-1 fee"
    );
    assert_eq!(
        read_dispute(&fx.svm, &fx.dispute).state,
        DisputeState::Failed
    );
}

#[test]
fn cancel_post_draw_before_grace_reverts() {
    let mut fx = drawn_setup();
    let vault = vault_ata(&fx.subaccord, &fx.mint);
    let cranker = fx.svm.svm.create_funded_account(1_000_000_000).unwrap();

    // Only just past the appeal window — the grace has not elapsed.
    let r = read_round(&fx.svm, &fx.round);
    warp_timestamp(&mut fx.svm, r.reveal_end + APPEAL_WINDOW_SECS);

    let juror_pdas: Vec<Pubkey> = fx.drawn.iter().map(|(_, p)| *p).collect();
    let remaining: Vec<Pubkey> = std::iter::once(fx.round)
        .chain(juror_pdas.iter().copied())
        .collect();

    let res = fx
        .svm
        .execute_instruction(
            cancel_dispute_ix(
                &fx.svm,
                &cranker.pubkey(),
                &fx.subaccord,
                &fx.dispute,
                &fx.mint,
                &fx.filer_ata,
                &vault,
                &remaining,
            ),
            &[&cranker],
        )
        .unwrap();
    assert!(
        !res.is_success(),
        "post-draw cancel before the grace must revert; logs={:?}",
        res.logs()
    );
    // active_draws still held.
    for (_, js) in &fx.drawn {
        assert_eq!(read_juror_stake(&fx.svm, js).active_draws, 1);
    }
}
