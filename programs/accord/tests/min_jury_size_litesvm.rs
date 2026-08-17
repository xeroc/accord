#![cfg(feature = "no-entrypoint")]
//! Per-Subaccord round-1 panel size (accord-9q3e). LiteSVM exercises the
//! `create_subaccord` validation introduced by the configurable `min_jury_size`:
//!
//! - N=1 + `max_appeals = 0` (the Arena/Inveigo config) creates and stores the field
//! - even `min_jury_size` is rejected (`EvenJurySize` — tie avoidance)
//! - a `(min_jury_size, max_appeals)` pair whose appeal ladder exceeds `MAX_JURORS`
//!   is rejected (`LadderExceedsMaxJurors`); a fitting pair passes
//! - the stored `Subaccord.min_jury_size` round-trips through Borsh
//!
//! Run via `make test_unit`.

use accord::state::{Aggregation, CreateSubaccordParams, ShortfallPolicy, Subaccord};
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

/// Build a default `CreateSubaccordParams` with overridable `min_jury_size` +
/// `max_appeals` — the two fields this bean parameterizes.
fn params(min_jury_size: u32, max_appeals: u8) -> CreateSubaccordParams {
    CreateSubaccordParams {
        min_stake: 1_000,
        alpha_bps: 1_000,
        review_window: 60,
        commit_window: 60,
        reveal_window: 60,
        appeal_window: accord::constants::MIN_APPEAL_WINDOW_SECS,
        max_appeals,
        min_jury_size,
        aggregation: Aggregation::Plurality,
        fee_per_juror: 1_000_000,
        reveal_threshold_bps: 6_666,
        shortfall_policy: ShortfallPolicy::Redraw,
        max_draw_attempts: 3,
        authority: Pubkey::default(),
        evidence_operator: Pubkey::default(),
        depth: 4,
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
    }
}

/// Fresh SVM + pause singleton + mint. Returns the context, creator keypair,
/// and mint — the caller drives `create_subaccord` with chosen params.
fn setup() -> (anchor_litesvm::AnchorContext, Keypair, Pubkey) {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    let pause = pause_pda();
    let ix = ctx
        .program()
        .accounts(accounts::InitializePause {
            authority: creator.pubkey(),
            accord_state: pause,
            system_program: system_program::ID,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
    (ctx, creator, mint)
}

/// Drive `create_subaccord` with the given params. `execute_instruction` always
/// returns `Ok(TransactionResult)` — failures are encoded via `is_success()` /
/// `error()`, not via `Result::Err` (anchor-litesvm 0.4.0 contract).
fn try_create(
    ctx: &mut anchor_litesvm::AnchorContext,
    creator: &Keypair,
    mint: &Pubkey,
    domain_ref: [u8; 32],
    p: CreateSubaccordParams,
) -> TransactionResult {
    let sub = subaccord_pda(&creator.pubkey(), &domain_ref);
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord: sub,
            staking_token: *mint,
            fee_token: *mint,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            domain_ref,
            evidence_spec: [0u8; 32],
            params: p,
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[creator]).unwrap()
}

fn nonzero_risk(seed: u8) -> [u8; 32] {
    let mut rt = [0u8; 32];
    rt[0] = seed;
    rt
}

/// Decode the stored Subaccord to verify the `min_jury_size` field round-tripped.
fn read_subaccord(
    ctx: &anchor_litesvm::AnchorContext,
    creator: &Pubkey,
    domain_ref: &[u8; 32],
) -> Subaccord {
    let sub = subaccord_pda(creator, domain_ref);
    let acc = ctx.svm.get_account(&sub).unwrap();
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

// ─── tests ──────────────────────────────────────────────────────────────────

#[test]
fn n1_max_appeals_zero_creates_and_stores_field() {
    // Arena/Inveigo config: single juror, no appeals.
    let (mut ctx, creator, mint) = setup();
    let rt = nonzero_risk(1);
    try_create(&mut ctx, &creator, &mint, rt, params(1, 0)).assert_success();
    let decoded = read_subaccord(&ctx, &creator.pubkey(), &rt);
    assert_eq!(decoded.min_jury_size, 1);
    assert_eq!(decoded.max_appeals, 0);
}

#[test]
fn default_j3_max_appeals3_creates() {
    // The v1 default: round-1 = 3, ladder top = 31 = MAX_JURORS (exact fit).
    let (mut ctx, creator, mint) = setup();
    try_create(&mut ctx, &creator, &mint, nonzero_risk(2), params(3, 3)).assert_success();
}

#[test]
fn even_jury_size_rejected() {
    // Even panels allow ties under plurality — rejected.
    let (mut ctx, creator, mint) = setup();
    let r = try_create(&mut ctx, &creator, &mint, nonzero_risk(3), params(2, 0));
    assert!(
        !r.is_success(),
        "even min_jury_size must be rejected; error: {:?}",
        r.error()
    );
}

#[test]
fn ladder_exceeding_max_jurors_rejected() {
    // J=5, max_appeals=3 → ladder top = (5+1)·2³ − 1 = 47 > 31. Rejected.
    let (mut ctx, creator, mint) = setup();
    let r = try_create(&mut ctx, &creator, &mint, nonzero_risk(4), params(5, 3));
    assert!(
        !r.is_success(),
        "ladder exceeding MAX_JURORS must be rejected; error: {:?}",
        r.error()
    );
}

#[test]
fn ladder_fitting_max_jurors_accepted() {
    // J=5, max_appeals=2 → ladder top = (5+1)·2² − 1 = 23 ≤ 31. Accepted.
    let (mut ctx, creator, mint) = setup();
    let rt = nonzero_risk(5);
    try_create(&mut ctx, &creator, &mint, rt, params(5, 2)).assert_success();
    let decoded = read_subaccord(&ctx, &creator.pubkey(), &rt);
    assert_eq!(decoded.min_jury_size, 5);
}

#[test]
fn n1_ladder_top_is_one() {
    // J=1, max_appeals=0 → ladder top = (1+1)·2⁰ − 1 = 1. The appeal ladder is
    // never exercised (max_appeals = 0), so round-0 is the only round.
    let (mut ctx, creator, mint) = setup();
    try_create(&mut ctx, &creator, &mint, nonzero_risk(6), params(1, 0)).assert_success();
}
