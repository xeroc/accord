#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `create_list` (SPEC §Instructions #1).
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy: create_list inits CanonList with all fields + CPI-creates the
//!   backing Subaccord with the Canon canonical defaults (incl. the passed
//!   evidence_operator)
//! - auth: (permissionless — no auth-fail case; any signer works)
//! - reinit: double create_list on the same PDA -> must fail (account in use)
//! - args: zero rules_hash -> InvalidRulesHash
//! - args: challenge_pct > MAX -> ChallengePctTooHigh
//! - args: court.alpha_bps > 10_000 -> AlphaTooHigh; zero review/commit/reveal
//!   window -> WindowTooShort; court.depth > MAX_LIST_TREE_DEPTH ->
//!   TreeDepthTooDeep; Accord CPI rejections propagate (EvenJurySize,
//!   LadderExceedsMaxJurors)
//! - args: evidence_operator = Pubkey::default -> InvalidEvidenceOperator
//!
//! Run via `make test_unit` (builds .so then `cargo test --features
//! no-entrypoint` in programs/canon). One fresh context per test.

use accord::state::{Aggregation, ShortfallPolicy, Subaccord};
use accord::ID as ACCORD_ID;
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use canon::constants::*;
use canon::state::{CanonList, CourtParams};
use canon::{accounts, instruction, ID as CANON_ID};
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

fn read_canon_list(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> CanonList {
    let acc = ctx.svm.get_account(pda).expect("CanonList PDA exists");
    CanonList::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_subaccord(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> Subaccord {
    let acc = ctx.svm.get_account(pda).expect("Subaccord PDA exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
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

/// Build + send a `create_list` instruction. Returns the transaction result
/// plus the (stake, fee) mints it created, so callers can assert they land on
/// `CanonList` — the mint is referenced once, as the validated Mint account.
fn do_create_list(
    ctx: &mut anchor_litesvm::AnchorContext,
    creator: &Keypair,
    rules: [u8; 32],
    challenge_pct: u16,
    evidence_operator: Pubkey,
) -> (TransactionResult, Pubkey, Pubkey) {
    let stake_mint = Pubkey::new_unique();
    let fee_mint = Pubkey::new_unique();
    create_mint(ctx, &stake_mint);
    create_mint(ctx, &fee_mint);
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
            challenge_pct,
            listing_window: DEFAULT_LISTING_WINDOW_SECS,
            withdrawal_timelock: DEFAULT_WITHDRAWAL_TIMELOCK_SECS,
            evidence_operator,
        })
        .instruction()
        .expect("build create_list instruction");
    let result = ctx.execute_instruction(ix, &[creator]).unwrap();
    (result, stake_mint, fee_mint)
}

/// Happy path: CanonList inits all fields + backing Subaccord gets the
/// canonical dispute-mechanism defaults.
#[test]
fn create_list_inits_canon_list_and_subaccord() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let list_pda = canon_list_pda(&creator.pubkey(), &rules);
    let sub_pda = subaccord_pda(&creator.pubkey(), &rules);

    let evidence_operator = Pubkey::new_unique();
    let (r, stake_mint, fee_mint) = do_create_list(
        &mut ctx,
        &creator,
        rules,
        DEFAULT_CHALLENGE_PCT_BPS,
        evidence_operator,
    );
    r.assert_success();

    // --- Verify CanonList ---
    let list = read_canon_list(&ctx, &list_pda);
    assert_eq!(list.creator, creator.pubkey());
    assert_eq!(list.stake_mint, stake_mint);
    assert_eq!(list.fee_mint, fee_mint);
    assert_eq!(list.rules_hash, rules);
    assert_eq!(list.list_program, Pubkey::default());
    assert_eq!(list.subaccord, sub_pda);
    assert_eq!(list.submit_deposit, DEFAULT_SUBMIT_DEPOSIT);
    assert_eq!(list.challenge_pct, DEFAULT_CHALLENGE_PCT_BPS);
    assert_eq!(list.listing_window, DEFAULT_LISTING_WINDOW_SECS);
    assert_eq!(list.withdrawal_timelock, DEFAULT_WITHDRAWAL_TIMELOCK_SECS);
    assert_eq!(list.item_count, 0);
    assert_eq!(
        list.authority, list_pda,
        "list authority mirrors the court's"
    );
    assert!(list.bump > 0);

    // --- Verify backing Subaccord has canonical defaults ---
    let sub = read_subaccord(&ctx, &sub_pda);
    assert_eq!(sub.creator, creator.pubkey());
    assert_eq!(sub.domain_ref, rules);
    assert_eq!(sub.evidence_spec, [0u8; 32]);
    assert_eq!(sub.staking_token, stake_mint);
    assert_eq!(sub.fee_token, fee_mint);
    assert_eq!(sub.min_stake, DEFAULT_MIN_STAKE);
    assert_eq!(sub.alpha_bps, DEFAULT_ALPHA_BPS);
    assert_eq!(sub.review_window, DEFAULT_REVIEW_WINDOW_SECS);
    assert_eq!(sub.commit_window, DEFAULT_COMMIT_WINDOW_SECS);
    assert_eq!(sub.reveal_window, DEFAULT_REVEAL_WINDOW_SECS);
    assert_eq!(sub.appeal_window, DEFAULT_APPEAL_WINDOW_SECS);
    assert_eq!(sub.max_appeals, DEFAULT_MAX_APPEALS);
    assert_eq!(sub.aggregation, Aggregation::Plurality);
    assert_eq!(sub.fee_per_juror, DEFAULT_FEE_PER_JUROR);
    assert_eq!(sub.reveal_threshold_bps, DEFAULT_REVEAL_THRESHOLD_BPS);
    assert_eq!(sub.shortfall_policy, ShortfallPolicy::Redraw);
    assert_eq!(sub.max_draw_attempts, DEFAULT_MAX_DRAW_ATTEMPTS);
    // The CanonList PDA is the court's authority: retuning must flow through
    // canon (a future gated instruction CPIs propose_subaccord_update with the
    // list PDA as signer). No external key, no burned upgrade path.
    assert_eq!(sub.authority, list_pda);
    assert_eq!(sub.evidence_operator, evidence_operator);
    assert_eq!(sub.depth, DEFAULT_TREE_DEPTH);
}

/// Double create on the same PDA must fail (account in use).
#[test]
fn create_list_double_init_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();

    let (r, ..) = do_create_list(
        &mut ctx,
        &creator,
        rules,
        DEFAULT_CHALLENGE_PCT_BPS,
        Pubkey::new_unique(),
    );
    r.assert_success();
    ctx.svm.expire_blockhash();

    let (r, ..) = do_create_list(
        &mut ctx,
        &creator,
        rules,
        DEFAULT_CHALLENGE_PCT_BPS,
        Pubkey::new_unique(),
    );
    assert!(
        !r.is_success(),
        "double create_list must fail; logs={:?}",
        r.logs()
    );
}

/// Zero rules_hash must fail with InvalidRulesHash.
#[test]
fn create_list_zero_rules_hash_fails() {
    let (mut ctx, creator) = setup();

    let (r, ..) = do_create_list(
        &mut ctx,
        &creator,
        [0u8; 32],
        DEFAULT_CHALLENGE_PCT_BPS,
        Pubkey::new_unique(),
    );
    assert!(
        !r.is_success(),
        "zero rules_hash must fail (InvalidRulesHash); logs={:?}",
        r.logs()
    );
}

/// challenge_pct exceeding MAX_CHALLENGE_PCT_BPS must fail with ChallengePctTooHigh.
#[test]
fn create_list_challenge_pct_too_high_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();

    let (r, ..) = do_create_list(
        &mut ctx,
        &creator,
        rules,
        MAX_CHALLENGE_PCT_BPS + 1,
        Pubkey::new_unique(),
    );
    assert!(
        !r.is_success(),
        "challenge_pct > MAX must fail (ChallengePctTooHigh); logs={:?}",
        r.logs()
    );
}

/// evidence_operator = Pubkey::default must fail (InvalidEvidenceOperator) —
/// a zero operator key can never be an ECIES target (the SDK refuses the
/// X25519 conversion), so lists must pin a real operator at creation.
#[test]
fn create_list_default_evidence_operator_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();

    let (r, ..) = do_create_list(
        &mut ctx,
        &creator,
        rules,
        DEFAULT_CHALLENGE_PCT_BPS,
        Pubkey::default(),
    );
    assert!(
        !r.is_success(),
        "default evidence_operator must fail (InvalidEvidenceOperator); logs={:?}",
        r.logs()
    );
}

// --- court: creator-configurable dispute-mechanism profile (accord-qz7d) -----

/// Custom (non-canonical) court profile. Every value deliberately differs from
/// the canonical defaults so a handler that ignores `court` and forwards the
/// old hardcoded constants cannot pass the verbatim assertions below.
fn court_params() -> CourtParams {
    CourtParams {
        min_stake: 7_777,
        alpha_bps: 2_500,
        review_window: 11 * 24 * 60 * 60,
        commit_window: 3 * 24 * 60 * 60,
        reveal_window: 4 * 24 * 60 * 60,
        appeal_window: 2 * 24 * 60 * 60, // above Accord's 1h floor
        max_appeals: 1,
        min_jury_size: 5, // odd; ladder top (5+1)·2¹−1 = 11 ≤ MAX_JURORS
        fee_per_juror: 42,
        reveal_threshold_bps: 5_000,
        max_draw_attempts: 2,
        depth: 6,
    }
}

/// `do_create_list` variant taking an explicit `court` profile. Once GREEN
/// lands this collapses into `do_create_list` (the `court` arg becomes
/// mandatory for every caller).
fn do_create_list_court(
    ctx: &mut anchor_litesvm::AnchorContext,
    creator: &Keypair,
    rules: [u8; 32],
    evidence_operator: Pubkey,
    court: CourtParams,
) -> (TransactionResult, Pubkey, Pubkey) {
    let stake_mint = Pubkey::new_unique();
    let fee_mint = Pubkey::new_unique();
    create_mint(ctx, &stake_mint);
    create_mint(ctx, &fee_mint);
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
            court,
        })
        .instruction()
        .expect("build create_list instruction");
    let result = ctx.execute_instruction(ix, &[creator]).unwrap();
    (result, stake_mint, fee_mint)
}

/// Happy: every `CourtParams` field lands verbatim on the backing Subaccord,
/// and the handler-pinned fields are NOT creator-settable: `aggregation` =
/// Plurality, `shortfall_policy` = Redraw, `coherence_tol_bps` = 0,
/// `authority` = the CanonList PDA, attestation pair default.
#[test]
fn create_list_custom_court_params_land_verbatim() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();
    let list_pda = canon_list_pda(&creator.pubkey(), &rules);
    let sub_pda = subaccord_pda(&creator.pubkey(), &rules);
    let evidence_operator = Pubkey::new_unique();
    let court = court_params();
    let (r, stake_mint, fee_mint) =
        do_create_list_court(&mut ctx, &creator, rules, evidence_operator, court.clone());
    r.assert_success();

    let sub = read_subaccord(&ctx, &sub_pda);
    assert_eq!(sub.staking_token, stake_mint);
    assert_eq!(sub.fee_token, fee_mint);
    assert_eq!(sub.evidence_operator, evidence_operator);
    // Creator-settable: land verbatim (values differ from every canonical
    // default — see court_params()).
    assert_eq!(sub.min_stake, court.min_stake);
    assert_eq!(sub.alpha_bps, court.alpha_bps);
    assert_eq!(sub.review_window, court.review_window);
    assert_eq!(sub.commit_window, court.commit_window);
    assert_eq!(sub.reveal_window, court.reveal_window);
    assert_eq!(sub.appeal_window, court.appeal_window);
    assert_eq!(sub.max_appeals, court.max_appeals);
    assert_eq!(sub.min_jury_size, court.min_jury_size);
    assert_eq!(sub.fee_per_juror, court.fee_per_juror);
    assert_eq!(sub.reveal_threshold_bps, court.reveal_threshold_bps);
    assert_eq!(sub.max_draw_attempts, court.max_draw_attempts);
    assert_eq!(sub.depth, court.depth);
    // Pinned by the handler — never creator-settable.
    assert_eq!(sub.aggregation, Aggregation::Plurality);
    assert_eq!(sub.shortfall_policy, ShortfallPolicy::Redraw);
    assert_eq!(sub.coherence_tol_bps, 0);
    assert_eq!(sub.authority, list_pda, "court authority is the list PDA");
    assert_eq!(sub.juror_credential, Pubkey::default());
    assert_eq!(sub.juror_schema, Pubkey::default());
}

/// alpha_bps above 10_000 must fail at the canon guard (AlphaTooHigh) —
/// Accord's `create_subaccord` has no alpha check of its own.
#[test]
fn create_list_alpha_bps_above_cap_fails() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.alpha_bps = 10_001;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "alpha_bps > 10_000 must fail; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("AlphaTooHigh"),
        "must fail with AlphaTooHigh; logs={:?}",
        r.logs()
    );
}

/// A zero review window bricks every dispute forever (commit never opens) —
/// third-party item deposits would be stuck, not just creator self-harm.
#[test]
fn create_list_zero_review_window_fails() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.review_window = 0;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "zero review_window must fail; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("WindowTooShort"),
        "must fail with WindowTooShort; logs={:?}",
        r.logs()
    );
}

/// Zero commit window → same anti-brick invariant as review.
#[test]
fn create_list_zero_commit_window_fails() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.commit_window = 0;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "zero commit_window must fail; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("WindowTooShort"),
        "must fail with WindowTooShort; logs={:?}",
        r.logs()
    );
}

/// Zero reveal window → same anti-brick invariant as review.
#[test]
fn create_list_zero_reveal_window_fails() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.reveal_window = 0;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "zero reveal_window must fail; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("WindowTooShort"),
        "must fail with WindowTooShort; logs={:?}",
        r.logs()
    );
}

/// depth > MAX_LIST_TREE_DEPTH (8) must fail at the canon guard
/// (TreeDepthTooDeep): each stake/draw tx carries a depth-length MST path
/// (~40 B/level); beyond 8 the draw tx blows the 1232-byte packet budget.
#[test]
fn create_list_depth_above_cap_fails() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.depth = MAX_LIST_TREE_DEPTH + 1;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "depth > MAX_LIST_TREE_DEPTH must fail; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("TreeDepthTooDeep"),
        "must fail with TreeDepthTooDeep; logs={:?}",
        r.logs()
    );
}

/// Even min_jury_size passes every canon guard and must be rejected by the
/// Accord CPI itself (EvenJurySize propagates through canon, unchecked here).
#[test]
fn create_list_even_jury_size_propagates_from_accord() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.min_jury_size = 4;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "even min_jury_size must fail via the CPI; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("EvenJurySize"),
        "Accord's EvenJurySize must propagate through canon; logs={:?}",
        r.logs()
    );
}

/// min_jury_size = 9 with max_appeals = 3 → ladder top (9+1)·2³−1 = 79 >
/// MAX_JURORS (31). Canon adds no jury validation of its own; Accord's
/// LadderExceedsMaxJurors must propagate through the CPI.
#[test]
fn create_list_ladder_overflow_propagates_from_accord() {
    let (mut ctx, creator) = setup();
    let mut court = court_params();
    court.min_jury_size = 9;
    court.max_appeals = 3;
    let (r, ..) = do_create_list_court(
        &mut ctx,
        &creator,
        rules_hash(),
        Pubkey::new_unique(),
        court,
    );
    assert!(
        !r.is_success(),
        "ladder overflow must fail via the CPI; logs={:?}",
        r.logs()
    );
    assert!(
        r.has_log("LadderExceedsMaxJurors"),
        "Accord's LadderExceedsMaxJurors must propagate; logs={:?}",
        r.logs()
    );
}
