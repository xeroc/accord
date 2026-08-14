#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `create_list` (SPEC §Instructions #1).
//!
//! Coverage (safe-solana-builder matrix, instruction subset):
//! - happy: create_list inits CanonList with all fields + CPI-creates the
//!   backing Subaccord with the Canon canonical defaults
//! - auth: (permissionless — no auth-fail case; any signer works)
//! - reinit: double create_list on the same PDA -> must fail (account in use)
//! - args: zero rules_hash -> InvalidRulesHash
//! - args: challenge_pct > MAX -> ChallengePctTooHigh
//!
//! Run via `make test_unit` (builds .so then `cargo test --features
//! no-entrypoint` in programs/canon). One fresh context per test.

use accord::state::{Aggregation, ShortfallPolicy, Subaccord};
use accord::ID as ACCORD_ID;
use anchor_lang::AccountDeserialize;
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use canon::constants::*;
use canon::state::CanonList;
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
    Pubkey::find_program_address(
        &[
            accord::constants::SEED_SUBACCORD,
            creator.as_ref(),
            rules.as_ref(),
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

    let (r, stake_mint, fee_mint) =
        do_create_list(&mut ctx, &creator, rules, DEFAULT_CHALLENGE_PCT_BPS);
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
    assert_eq!(sub.risk_type, rules);
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
    assert_eq!(sub.evidence_operator, Pubkey::default());
    assert_eq!(sub.depth, DEFAULT_TREE_DEPTH);
}

/// Double create on the same PDA must fail (account in use).
#[test]
fn create_list_double_init_fails() {
    let (mut ctx, creator) = setup();
    let rules = rules_hash();

    let (r, ..) = do_create_list(&mut ctx, &creator, rules, DEFAULT_CHALLENGE_PCT_BPS);
    r.assert_success();
    ctx.svm.expire_blockhash();

    let (r, ..) = do_create_list(&mut ctx, &creator, rules, DEFAULT_CHALLENGE_PCT_BPS);
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

    let (r, ..) = do_create_list(&mut ctx, &creator, [0u8; 32], DEFAULT_CHALLENGE_PCT_BPS);
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

    let (r, ..) = do_create_list(&mut ctx, &creator, rules, MAX_CHALLENGE_PCT_BPS + 1);
    assert!(
        !r.is_success(),
        "challenge_pct > MAX must fail (ChallengePctTooHigh); logs={:?}",
        r.logs()
    );
}
