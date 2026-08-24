#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `update_list` + `propose_court_update` (SPEC
//! §Instructions #9/#10 — the retuning path, accord-gou8).
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - update_list happy: params change instantly (no timelock)
//! - update_list auth: non-authority signer -> Unauthorized
//! - update_list auth: authority rotation lands; old key loses, new key gains
//! - update_list args: challenge_pct > MAX -> ChallengePctTooHigh;
//!   listing_window == 0 / withdrawal_timelock == 0 -> WindowTooShort;
//!   submit_deposit == 0 -> ZeroDeposit
//! - propose_court_update happy: CPIs Accord propose_subaccord_update with
//!   the list PDA as authority (invoke_signed) and the caller as rent_payer;
//!   PendingUpdate lands with payload verbatim, proposed_by = list PDA
//! - propose_court_update auth: non-authority caller -> Unauthorized
//! - propose_court_update args: Authority variant -> ForbiddenPayload;
//!   AlphaBps > 10_000 -> AlphaTooHigh; zero review window -> WindowTooShort
//! - propose_court_update: RevealThresholdBps variant passes through (ADR-0028)
//!
//! Run via `make test_unit` (builds .so then `cargo test --features
//! no-entrypoint` in programs/canon). One fresh context per test.

use accord::state::{PendingUpdate, Subaccord, UpdatePayload};
use accord::ID as ACCORD_ID;
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use canon::constants::*;
use canon::state::{CanonList, CourtParams};
use canon::{accounts, instruction, CanonError, ID as CANON_ID};
use solana_program::pubkey::Pubkey;
use solana_sdk::account::Account as SvmAccount;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use spl_token::solana_program::program_option::COption;
use spl_token::solana_program::program_pack::Pack;
use spl_token::state::Mint as SplMint;
use spl_token::ID as TOKEN_PROGRAM_ID;
use std::path::PathBuf;

/// Read a compiled program .so. Requires `anchor build`.
fn load_so(name: &str) -> Vec<u8> {
    let so =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../target/deploy/{name}.so"));
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
}

/// Fresh SVM with both canon (primary) and accord (CPI target) deployed +
/// a funded creator keypair.
fn setup() -> (anchor_litesvm::AnchorContext, Keypair) {
    let mut ctx = AnchorLiteSVM::build_with_programs(&[
        (CANON_ID, &load_so("canon")),
        (ACCORD_ID, &load_so("accord")),
    ]);
    let creator = Keypair::new();
    ctx.svm
        .airdrop(
            &creator.pubkey(),
            50 * solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .unwrap();
    (ctx, creator)
}

/// Non-zero rules_hash for tests.
fn rules_hash() -> [u8; 32] {
    let mut h = [0u8; 32];
    h[0] = 1;
    h
}

fn canon_list_pda(creator: &Pubkey, rules: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_CANON_LIST, creator.as_ref(), rules.as_ref()],
        &CANON_ID,
    )
    .0
}

fn subaccord_pda(creator: &Pubkey, rules: &[u8; 32]) -> Pubkey {
    accord::subaccord_pda(creator, rules).0
}

fn pending_update_pda(subaccord: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            accord::constants::SEED_PENDING_UPDATE,
            subaccord.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &ACCORD_ID,
    )
    .0
}

fn read_canon_list(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> CanonList {
    let acc = ctx.svm.get_account(pda).expect("CanonList PDA exists");
    CanonList::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_subaccord(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Subaccord {
    let acc = ctx.svm.get_account(pda).expect("Subaccord PDA exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_pending_update(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> PendingUpdate {
    let acc = ctx.svm.get_account(pda).expect("PendingUpdate PDA exists");
    PendingUpdate::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn create_mint(svm: &mut anchor_litesvm::AnchorContext, mint: &Pubkey) {
    let mut buf = [0u8; SplMint::LEN];
    Pack::pack(
        SplMint {
            mint_authority: COption::None,
            supply: 1_000_000_000,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut buf,
    )
    .unwrap();
    svm.svm
        .set_account(
            *mint,
            SvmAccount {
                lamports: 1_000_000_000,
                data: buf.to_vec(),
                owner: TOKEN_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

/// Canonical court profile — the values the SDK's `defaultCourtParams()`
/// ships (mirrors create_list_litesvm).
fn canonical_court() -> CourtParams {
    CourtParams {
        min_stake: 1_000,
        alpha_bps: 1_000,
        review_window: 7 * 24 * 60 * 60,
        commit_window: 2 * 24 * 60 * 60,
        reveal_window: 2 * 24 * 60 * 60,
        appeal_window: 3 * 24 * 60 * 60,
        max_appeals: 3,
        min_jury_size: 3,
        fee_per_juror: 10,
        reveal_threshold_bps: 6_666,
        max_draw_attempts: 3,
        depth: 8,
    }
}

/// Create a list with the canonical court profile; the creator is the
/// governance authority. Returns the rules_hash-derived PDAs.
fn do_create_list(
    ctx: &mut anchor_litesvm::AnchorContext,
    creator: &Keypair,
    rules: [u8; 32],
) -> (Pubkey, Pubkey) {
    let stake_mint = Pubkey::new_unique();
    let fee_mint = Pubkey::new_unique();
    create_mint(ctx, &stake_mint);
    create_mint(ctx, &fee_mint);
    let evidence_operator = Pubkey::new_unique();
    let ix = ctx
        .program()
        .accounts(accounts::CreateList {
            creator: creator.pubkey(),
            stake_mint,
            fee_mint,
            list: canon_list_pda(&creator.pubkey(), &rules),
            subaccord: subaccord_pda(&creator.pubkey(), &rules),
            accord_program: ACCORD_ID,
            system_program: anchor_lang::system_program::ID,
        })
        .args(instruction::CreateList {
            list_program: Pubkey::default(),
            rules_hash: rules,
            submit_deposit: DEFAULT_SUBMIT_DEPOSIT,
            challenge_pct: DEFAULT_CHALLENGE_PCT_BPS,
            listing_window: DEFAULT_LISTING_WINDOW_SECS,
            withdrawal_timelock: DEFAULT_WITHDRAWAL_TIMELOCK_SECS,
            evidence_operator,
            court: canonical_court(),
        })
        .instruction()
        .expect("build create_list instruction");
    ctx.execute_instruction(ix, &[creator])
        .unwrap()
        .assert_success();
    (
        canon_list_pda(&creator.pubkey(), &rules),
        subaccord_pda(&creator.pubkey(), &rules),
    )
}

/// Build + send an `update_list` instruction signed by `authority_key`.
fn do_update_list(
    ctx: &mut anchor_litesvm::AnchorContext,
    authority_key: &Keypair,
    creator: &Pubkey,
    rules: [u8; 32],
    submit_deposit: u64,
    challenge_pct: u16,
    listing_window: u64,
    withdrawal_timelock: u64,
    new_authority: Pubkey,
) -> TransactionResult {
    let ix = ctx
        .program()
        .accounts(accounts::UpdateList {
            authority: authority_key.pubkey(),
            list: canon_list_pda(creator, &rules),
        })
        .args(instruction::UpdateList {
            submit_deposit,
            challenge_pct,
            listing_window,
            withdrawal_timelock,
            new_authority,
        })
        .instruction()
        .expect("build update_list instruction");
    ctx.execute_instruction(ix, &[authority_key]).unwrap()
}

/// Build + send a `propose_court_update` instruction signed by `caller_key`.
fn do_propose_court_update(
    ctx: &mut anchor_litesvm::AnchorContext,
    caller_key: &Keypair,
    creator: &Pubkey,
    rules: [u8; 32],
    nonce: u64,
    payload: UpdatePayload,
) -> TransactionResult {
    let subaccord = subaccord_pda(creator, &rules);
    let ix = ctx
        .program()
        .accounts(accounts::ProposeCourtUpdate {
            caller: caller_key.pubkey(),
            list: canon_list_pda(creator, &rules),
            subaccord,
            pending_update: pending_update_pda(&subaccord, nonce),
            accord_program: ACCORD_ID,
            system_program: anchor_lang::system_program::ID,
        })
        .args(instruction::ProposeCourtUpdate { nonce, payload })
        .instruction()
        .expect("build propose_court_update instruction");
    ctx.execute_instruction(ix, &[caller_key]).unwrap()
}

// --- update_list -------------------------------------------------------------

/// Happy: all four list params change instantly — no PDA, no timelock, no
/// court interaction. `Pubkey::default()` keeps the authority.
#[test]
fn update_list_changes_params_instantly() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, _) = do_create_list(&mut ctx, &creator, rules);

    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        9_999,
        2_500,
        3600,
        7200,
        Pubkey::default(),
    );
    r.assert_success();

    let list = read_canon_list(&ctx, &list_pda);
    assert_eq!(list.submit_deposit, 9_999);
    assert_eq!(list.challenge_pct, 2_500);
    assert_eq!(list.listing_window, 3600);
    assert_eq!(list.withdrawal_timelock, 7200);
    // Governance key unchanged — the creator stays the authority.
    assert_eq!(list.authority, creator.pubkey());
}

/// create_list now pins the creator (not the list PDA) as CanonList.authority.
#[test]
fn create_list_pins_creator_as_authority() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, sub_pda) = do_create_list(&mut ctx, &creator, rules);

    let list = read_canon_list(&ctx, &list_pda);
    assert_eq!(list.authority, creator.pubkey());
    // The backing Subaccord's authority stays the list PDA — pinned forever.
    let sub = read_subaccord(&ctx, &sub_pda);
    assert_eq!(sub.authority, list_pda);
}

/// A non-authority signer must fail with Unauthorized.
#[test]
fn update_list_wrong_authority_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, _) = do_create_list(&mut ctx, &creator, rules);

    let stranger = Keypair::new();
    ctx.svm
        .airdrop(
            &stranger.pubkey(),
            5 * solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .unwrap();
    let r = do_update_list(
        &mut ctx,
        &stranger,
        &creator.pubkey(),
        rules,
        100,
        1_000,
        60,
        60,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::Unauthorized as u32 + 6000
    ));

    // Nothing changed.
    let list = read_canon_list(&ctx, &list_pda);
    assert_eq!(list.submit_deposit, DEFAULT_SUBMIT_DEPOSIT);
}

/// Authority rotation: new key lands, old key loses access, new key works.
#[test]
fn update_list_rotates_authority() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, _) = do_create_list(&mut ctx, &creator, rules);

    let successor = Keypair::new();
    ctx.svm
        .airdrop(
            &successor.pubkey(),
            5 * solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .unwrap();
    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        100,
        1_000,
        60,
        60,
        successor.pubkey(),
    );
    r.assert_success();
    assert_eq!(
        read_canon_list(&ctx, &list_pda).authority,
        successor.pubkey()
    );

    // Old authority is locked out.
    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        200,
        1_000,
        60,
        60,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::Unauthorized as u32 + 6000
    ));

    // New authority works.
    let r = do_update_list(
        &mut ctx,
        &successor,
        &creator.pubkey(),
        rules,
        300,
        1_500,
        90,
        90,
        Pubkey::default(),
    );
    r.assert_success();
    assert_eq!(read_canon_list(&ctx, &list_pda).submit_deposit, 300);
}

/// challenge_pct above MAX_CHALLENGE_PCT_BPS fails (ChallengePctTooHigh).
#[test]
fn update_list_challenge_pct_above_cap_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, _) = do_create_list(&mut ctx, &creator, rules);

    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        100,
        MAX_CHALLENGE_PCT_BPS + 1,
        60,
        60,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::ChallengePctTooHigh as u32 + 6000
    ));
    assert_eq!(
        read_canon_list(&ctx, &list_pda).challenge_pct,
        DEFAULT_CHALLENGE_PCT_BPS
    );
}

/// Zero listing window bricks the auto-listing crank path — rejected.
#[test]
fn update_list_zero_listing_window_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        100,
        1_000,
        0,
        60,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::WindowTooShort as u32 + 6000
    ));
}

/// Zero withdrawal timelock would let submitters delist instantly — rejected.
#[test]
fn update_list_zero_withdrawal_timelock_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        100,
        1_000,
        60,
        0,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::WindowTooShort as u32 + 6000
    ));
}

/// Zero submit_deposit removes all skin-in-the-game — rejected.
#[test]
fn update_list_zero_deposit_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let r = do_update_list(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        0,
        1_000,
        60,
        60,
        Pubkey::default(),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::ZeroDeposit as u32 + 6000
    ));
}

// --- propose_court_update ------------------------------------------------------

/// Happy CPI: the CanonList PDA signs Accord's propose_subaccord_update
/// (authority), the caller pays rent. PendingUpdate lands with the payload
/// verbatim, proposed_by = the list PDA, and the Subaccord is NOT yet mutated
/// (48h timelock; execution is Accord's permissionless
/// execute_subaccord_update).
#[test]
fn propose_court_update_creates_pending_update() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (list_pda, sub_pda) = do_create_list(&mut ctx, &creator, rules);

    let nonce = 0u64;
    let payload = UpdatePayload::AlphaBps(2_500);
    let r = do_propose_court_update(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        nonce,
        payload.clone(),
    );
    r.assert_success();

    let pu = read_pending_update(&ctx, &pending_update_pda(&sub_pda, nonce));
    assert_eq!(pu.subaccord, sub_pda);
    assert_eq!(pu.nonce, nonce);
    assert_eq!(pu.proposed, payload);
    assert_eq!(pu.proposed_by, list_pda, "proposer is the list PDA");
    assert!(pu.execute_after_slot > 0, "timelock armed");

    // No instant mutation — the timelock owns the change.
    let sub = read_subaccord(&ctx, &sub_pda);
    assert_eq!(sub.alpha_bps, canonical_court().alpha_bps);
    // The Subaccord authority is still the list PDA.
    assert_eq!(sub.authority, list_pda);
}

/// A non-authority caller must fail with Unauthorized before any CPI.
#[test]
fn propose_court_update_wrong_caller_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let stranger = Keypair::new();
    ctx.svm
        .airdrop(
            &stranger.pubkey(),
            5 * solana_sdk::native_token::LAMPORTS_PER_SOL,
        )
        .unwrap();
    let r = do_propose_court_update(
        &mut ctx,
        &stranger,
        &creator.pubkey(),
        rules,
        0,
        UpdatePayload::AlphaBps(1_500),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::Unauthorized as u32 + 6000
    ));
}

/// UpdatePayload::Authority must be rejected by canon (ForbiddenPayload) —
/// rotating the Subaccord authority off the list PDA permanently strands
/// retuning.
#[test]
fn propose_court_update_authority_payload_forbidden() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (_, sub_pda) = do_create_list(&mut ctx, &creator, rules);

    let r = do_propose_court_update(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        0,
        UpdatePayload::Authority(Pubkey::new_unique()),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::ForbiddenPayload as u32 + 6000
    ));
    assert!(
        ctx.svm
            .get_account(&pending_update_pda(&sub_pda, 0))
            .is_none(),
        "no PendingUpdate may be created for a forbidden payload"
    );
}

/// Mirror of the create_list guard: AlphaBps > 10_000 -> AlphaTooHigh.
#[test]
fn propose_court_update_alpha_above_cap_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let r = do_propose_court_update(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        0,
        UpdatePayload::AlphaBps(10_001),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::AlphaTooHigh as u32 + 6000
    ));
}

/// Mirror of the create_list anti-brick guard: ReviewWindow(0) ->
/// WindowTooShort (same for CommitWindow/RevealWindow).
#[test]
fn propose_court_update_zero_review_window_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    do_create_list(&mut ctx, &creator, rules);

    let r = do_propose_court_update(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        0,
        UpdatePayload::ReviewWindow(0),
    );
    r.assert_error(&format!(
        "Custom({})",
        CanonError::WindowTooShort as u32 + 6000
    ));
}

/// The ADR-0028 retunable variants pass through canon untouched —
/// RevealThresholdBps proposes fine (Accord validates the value).
#[test]
fn propose_court_update_reveal_threshold_passes_through() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let (_, sub_pda) = do_create_list(&mut ctx, &creator, rules);

    let r = do_propose_court_update(
        &mut ctx,
        &creator,
        &creator.pubkey(),
        rules,
        7,
        UpdatePayload::RevealThresholdBps(8_000),
    );
    r.assert_success();
    let pu = read_pending_update(&ctx, &pending_update_pda(&sub_pda, 7));
    assert_eq!(pu.proposed, UpdatePayload::RevealThresholdBps(8_000));
}
