#![cfg(feature = "no-entrypoint")]
//! Subaccord update path (ADR-0005 + ADR-0028 rent-payer split). LiteSVM
//! exercises the propose → timelock → execute flow end-to-end:
//!
//! - happy : separate rent payer + authority → propose → (execute reverts
//!   before the timelock) → warp → execute applies the payload + closes the
//!   PendingUpdate (rent to the caller)
//! - auth  : wrong authority proposes            -> must fail (Unauthorized)
//! - state : immutable pool proposes             -> must fail (ImmutableSubaccord)
//! - state : reused nonce (reinit collision)     -> must fail
//! - rent  : rent_payer pays, authority's balance untouched by rent
//! - bound : RevealThresholdBps > 10_000 / MaxDrawAttempts = 0 rejected at propose
//! - bound : Median pool + RevealThresholdBps(0) rejected (SR2-L-1 cross-field,
//!           create_subaccord gate parity); Plurality + 0 accepted
//! - bound : MaxAppeals update birthing a degenerate ladder rejected
//!           (SR2-L-1 cross-field re-check)
//!
//! Run via `make test_unit`.

use accord::constants::{MIN_APPEAL_WINDOW_SECS, UPDATE_TIMELOCK_SLOTS};
use accord::state::{
    Aggregation, CreateSubaccordParams, PendingUpdate, ShortfallPolicy, Subaccord, UpdatePayload,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize};
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use solana_program::pubkey::Pubkey;
use solana_sdk::{
    account::Account as SvmAccount, native_token::LAMPORTS_PER_SOL, signature::Keypair,
    signer::Signer,
};
use spl_token::solana_program::{program_option::COption, program_pack::Pack};
use spl_token::state::Mint as SplMint;
use spl_token::ID as TOKEN_PROGRAM_ID;
use std::path::PathBuf;

const SPL_RENT: u64 = 1_000_000_000;

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

fn subaccord_pda(creator: &Pubkey, domain_ref: &[u8; 32]) -> Pubkey {
    accord::subaccord_pda(creator, domain_ref).0
}

fn pause_pda() -> Pubkey {
    accord::accord_state_pda().0
}

fn pending_update_pda(subaccord: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            accord::constants::SEED_PENDING_UPDATE,
            subaccord.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &ID,
    )
    .0
}

fn create_mint(ctx: &mut anchor_litesvm::AnchorContext, mint: &Pubkey) {
    let mut buf = [0u8; SplMint::LEN];
    let m = SplMint {
        mint_authority: COption::None,
        supply: 1_000_000_000,
        decimals: 6,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    Pack::pack(m, &mut buf).unwrap();
    ctx.svm
        .set_account(
            *mint,
            SvmAccount {
                lamports: SPL_RENT,
                data: buf.to_vec(),
                owner: TOKEN_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

fn params(aggregation: Aggregation, authority: Pubkey) -> CreateSubaccordParams {
    CreateSubaccordParams {
        min_stake: 1_000,
        alpha_bps: 1_000,
        review_window: 60,
        commit_window: 60,
        reveal_window: 60,
        appeal_window: MIN_APPEAL_WINDOW_SECS,
        max_appeals: 3,
        min_jury_size: 3,
        aggregation,
        fee_per_juror: 1_000_000,
        reveal_threshold_bps: 6_666,
        coherence_tol_bps: 0,
        shortfall_policy: ShortfallPolicy::Redraw,
        max_draw_attempts: 3,
        authority,
        evidence_operator: Pubkey::default(),
        depth: 4,
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
    }
}

/// Fresh SVM + pause singleton + mint + funded authority / rent payer /
/// attacker. Returns (ctx, authority, rent_payer, mint).
fn setup() -> (anchor_litesvm::AnchorContext, Keypair, Keypair, Pubkey) {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());
    let authority = Keypair::new();
    let rent_payer = Keypair::new();
    for kp in [&authority, &rent_payer] {
        ctx.svm
            .airdrop(&kp.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();
    }

    let pause = pause_pda();
    let ix = ctx
        .program()
        .accounts(accounts::InitializePause {
            authority: authority.pubkey(),
            accord_state: pause,
            system_program: system_program::ID,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
    (ctx, authority, rent_payer, mint)
}

/// Create a mutable Subaccord with `authority` as its authority (Plurality
/// unless overridden). Returns its domain_ref / PDA.
fn create_sub(
    ctx: &mut anchor_litesvm::AnchorContext,
    authority: &Keypair,
    mint: &Pubkey,
    aggregation: Aggregation,
) -> ([u8; 32], Pubkey) {
    let domain_ref = {
        let mut rt = [0u8; 32];
        rt[0] = 0x7f;
        rt
    };
    let sub = subaccord_pda(&authority.pubkey(), &domain_ref);
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: authority.pubkey(),
            subaccord: sub,
            staking_token: *mint,
            fee_token: *mint,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            domain_ref,
            evidence_spec: [0u8; 32],
            params: params(aggregation, authority.pubkey()),
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[authority])
        .unwrap()
        .assert_success();
    (domain_ref, sub)
}

/// Drive `propose_subaccord_update` with explicit authority + rent payer
/// signers (the PDA-authority CPI shape: signer roles may differ).
fn try_propose(
    ctx: &mut anchor_litesvm::AnchorContext,
    authority: &Keypair,
    rent_payer: &Keypair,
    sub: &Pubkey,
    nonce: u64,
    payload: UpdatePayload,
) -> TransactionResult {
    let pu = pending_update_pda(sub, nonce);
    let ix = ctx
        .program()
        .accounts(accounts::ProposeSubaccordUpdate {
            authority: authority.pubkey(),
            rent_payer: rent_payer.pubkey(),
            subaccord: *sub,
            pending_update: pu,
            system_program: system_program::ID,
        })
        .args(instruction::ProposeSubaccordUpdate { nonce, payload })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[authority, rent_payer])
        .unwrap()
}

/// Drive the permissionless `execute_subaccord_update` (caller = rent_payer,
/// an arbitrary wallet).
fn try_execute(
    ctx: &mut anchor_litesvm::AnchorContext,
    caller: &Keypair,
    sub: &Pubkey,
    nonce: u64,
) -> TransactionResult {
    let pu = pending_update_pda(sub, nonce);
    let ix = ctx
        .program()
        .accounts(accounts::ExecuteSubaccordUpdate {
            caller: caller.pubkey(),
            subaccord: *sub,
            pending_update: pu,
        })
        .args(instruction::ExecuteSubaccordUpdate {})
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn read_subaccord(ctx: &anchor_litesvm::AnchorContext, sub: &Pubkey) -> Subaccord {
    let acc = ctx.svm.get_account(sub).unwrap();
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_pending(ctx: &anchor_litesvm::AnchorContext, pu: &Pubkey) -> Option<PendingUpdate> {
    ctx.svm
        .get_account(pu)
        .map(|acc| PendingUpdate::try_deserialize(&mut &acc.data[..]).unwrap())
}

fn lamports(ctx: &anchor_litesvm::AnchorContext, key: &Pubkey) -> u64 {
    ctx.svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
}

fn current_slot(ctx: &anchor_litesvm::AnchorContext) -> u64 {
    ctx.svm
        .get_sysvar::<solana_program::sysvar::clock::Clock>()
        .slot
}

// ─── happy path: split signers, both new variants applied ───────────────────

#[test]
fn propose_execute_applies_new_variants_and_closes_pending() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);

    // Authority signs, rent payer pays — the PDA-authority CPI shape.
    // (The authority still pays its own tx fees for signing; the invariant
    // is that the RENT — the PendingUpdate's lamports — leaves the rent
    // payer's wallet, not the authority's.)
    let payer_before = lamports(&ctx, &rent_payer.pubkey());
    let authority_before = lamports(&ctx, &authority.pubkey());
    try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::MaxDrawAttempts(5),
    )
    .assert_success();
    ctx.svm.expire_blockhash();

    // PendingUpdate landed with the payload + 48h ETA.
    let pu_addr = pending_update_pda(&sub, 1);
    let pu = read_pending(&ctx, &pu_addr).expect("pending update exists");
    let rent = lamports(&ctx, &pu_addr);
    assert!(rent > 0, "PendingUpdate must custody rent after init");
    // rent_payer dropped by ≥ rent; the authority's drop is fees-only (< rent).
    assert!(
        payer_before - lamports(&ctx, &rent_payer.pubkey()) >= rent,
        "rent_payer must carry the PendingUpdate rent"
    );
    assert!(
        authority_before - lamports(&ctx, &authority.pubkey()) < rent,
        "authority must not pay the rent when a rent_payer is supplied"
    );
    assert_eq!(pu.proposed, UpdatePayload::MaxDrawAttempts(5));
    assert_eq!(pu.proposed_by, authority.pubkey());
    let eta = pu.execute_after_slot;
    assert_eq!(eta, current_slot(&ctx) + UPDATE_TIMELOCK_SLOTS);

    // Execute BEFORE the timelock: must fail, pool unchanged.
    assert!(
        !try_execute(&mut ctx, &rent_payer, &sub, 1).is_success(),
        "execute must fail before the timelock"
    );
    ctx.svm.expire_blockhash();
    assert_eq!(read_subaccord(&ctx, &sub).max_draw_attempts, 3);

    // Warp past the ETA, then execute applies + closes (rent to the caller).
    ctx.svm.warp_to_slot(eta + 1);
    try_execute(&mut ctx, &rent_payer, &sub, 1).assert_success();
    assert_eq!(read_subaccord(&ctx, &sub).max_draw_attempts, 5);
    assert!(
        read_pending(&ctx, &pu_addr).is_none(),
        "PendingUpdate must be closed after execute"
    );

    // Second new variant round-trips too (RevealThresholdBps; Plurality
    // tolerates the 0 lower bound, here a plain retune).
    try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        2,
        UpdatePayload::RevealThresholdBps(8_000),
    )
    .assert_success();
    ctx.svm.expire_blockhash();
    let eta2 = read_pending(&ctx, &pending_update_pda(&sub, 2))
        .unwrap()
        .execute_after_slot;
    ctx.svm.warp_to_slot(eta2 + 1);
    try_execute(&mut ctx, &rent_payer, &sub, 2).assert_success();
    assert_eq!(read_subaccord(&ctx, &sub).reveal_threshold_bps, 8_000);
}

// ─── auth / state / reinit ──────────────────────────────────────────────────

#[test]
fn wrong_authority_cannot_propose() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);
    let attacker = Keypair::new();
    ctx.svm
        .airdrop(&attacker.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();

    let r = try_propose(
        &mut ctx,
        &attacker,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::MinStake(2_000),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
    ctx.svm.expire_blockhash();
    assert!(
        read_pending(&ctx, &pending_update_pda(&sub, 1)).is_none(),
        "no PendingUpdate may exist after a rejected propose"
    );
}

#[test]
fn immutable_subaccord_rejects_propose() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    // authority == Pubkey::default() => immutable (ADR-0005).
    let domain_ref = {
        let mut rt = [0u8; 32];
        rt[0] = 0x7e;
        rt
    };
    let sub = subaccord_pda(&authority.pubkey(), &domain_ref);
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: authority.pubkey(),
            subaccord: sub,
            staking_token: mint,
            fee_token: mint,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            domain_ref,
            evidence_spec: [0u8; 32],
            params: params(Aggregation::Plurality, Pubkey::default()),
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();

    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::MinStake(2_000),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
}

#[test]
fn reused_nonce_fails_to_reinit() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);

    try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        9,
        UpdatePayload::MinStake(2_000),
    )
    .assert_success();
    ctx.svm.expire_blockhash();

    // Same nonce => same PDA already exists => init fails (reinit guard).
    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        9,
        UpdatePayload::MinStake(3_000),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
    // The first proposal is untouched.
    assert_eq!(
        read_pending(&ctx, &pending_update_pda(&sub, 9))
            .unwrap()
            .proposed,
        UpdatePayload::MinStake(2_000)
    );
}

// ─── new-variant domain bounds (validate_update_payload) ────────────────────

#[test]
fn reveal_threshold_above_cap_rejected_at_propose() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);
    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::RevealThresholdBps(10_001),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
}

#[test]
fn zero_max_draw_attempts_rejected_at_propose() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);
    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::MaxDrawAttempts(0),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
}

// ─── cross-field (validate_update_cross_field, SR2-L-1) ─────────────────────

#[test]
fn median_pool_rejects_zero_reveal_threshold() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Median);
    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::RevealThresholdBps(0),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
}

#[test]
fn plurality_pool_accepts_zero_reveal_threshold() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    let (_, sub) = create_sub(&mut ctx, &authority, &mint, Aggregation::Plurality);
    try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::RevealThresholdBps(0),
    )
    .assert_success();
}

#[test]
fn max_appeals_update_rechecked_against_ladder() {
    let (mut ctx, authority, rent_payer, mint) = setup();
    // min_jury_size = 3, max_appeals = 3 fits at creation ((3+1)·2³−1 = 31);
    // an update is a no-op ladder-wise — use the tightest pool instead:
    // min_jury_size = 5 with max_appeals = 2 ((5+1)·2²−1 = 23 ≤ 31) can NOT
    // take max_appeals = 3 ((5+1)·2³−1 = 47 > 31).
    let domain_ref = {
        let mut rt = [0u8; 32];
        rt[0] = 0x7d;
        rt
    };
    let sub = subaccord_pda(&authority.pubkey(), &domain_ref);
    let p = CreateSubaccordParams {
        min_jury_size: 5,
        max_appeals: 2,
        ..params(Aggregation::Plurality, authority.pubkey())
    };
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: authority.pubkey(),
            subaccord: sub,
            staking_token: mint,
            fee_token: mint,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            domain_ref,
            evidence_spec: [0u8; 32],
            params: p,
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&authority])
        .unwrap()
        .assert_success();

    let r = try_propose(
        &mut ctx,
        &authority,
        &rent_payer,
        &sub,
        1,
        UpdatePayload::MaxAppeals(3),
    );
    assert!(!r.is_success(), "logs={:?}", r.logs());
}
