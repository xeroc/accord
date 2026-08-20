#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `advance_pending` (bean accord-pcmo).
//!
//! Coverage (TDD acceptance matrix from the bean):
//!   - advances after the `listing_window` elapses → `Listed`
//!   - reverts before the window elapses
//!   - reverts if the item is `Disputed` (not `Pending`)
//!
//! Reuses the `submit_item` setup (submit_item is the dependency). The window
//! is driven by the fabricated `CanonList.listing_window` value, so no clock
//! manipulation is needed: `listing_window = 0` ⇒ immediately past, a large
//! value ⇒ still open.

use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
use anchor_litesvm::AnchorLiteSVM;
use canon::state::{CanonItem, CanonList, ItemState};
use canon::{accounts, constants::*, instruction, ID};
use solana_program::pubkey::Pubkey;
use solana_sdk::account::Account as SvmAccount;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::solana_program::program_option::COption;
use spl_token::solana_program::program_pack::Pack;
use spl_token::state::{Account as SplTokenAccount, AccountState, Mint as SplMint};
use spl_token::ID as TOKEN_PROGRAM_ID;
use std::path::PathBuf;

const SPL_RENT: u64 = 1_000_000_000;

const RULES_HASH: [u8; 32] = {
    let mut h = [0u8; 32];
    h[0] = 0xAB;
    h
};

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/canon.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

// ─── SPL fabrication helpers (shared with submit_item_litesvm) ────────────────

fn create_mint(svm: &mut anchor_litesvm::AnchorContext, mint: &Pubkey) {
    let mut buf = [0u8; SplMint::LEN];
    let m = SplMint {
        mint_authority: COption::None,
        supply: 1_000_000_000,
        decimals: 6,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    Pack::pack(m, &mut buf).unwrap();
    svm.svm
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

fn create_token_account(
    svm: &mut anchor_litesvm::AnchorContext,
    addr: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    amount: u64,
) {
    let mut buf = [0u8; SplTokenAccount::LEN];
    let acc = SplTokenAccount {
        mint: *mint,
        owner: *owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    Pack::pack(acc, &mut buf).unwrap();
    svm.svm
        .set_account(
            *addr,
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

// ─── PDA / ATA helpers ───────────────────────────────────────────────────────

fn list_pda(creator: &Pubkey, rules_hash: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_CANON_LIST, creator.as_ref(), rules_hash], &ID)
}

fn item_pda(list: &Pubkey, account: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_CANON_ITEM, list.as_ref(), account.as_ref()], &ID).0
}

fn vault_ata(list: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(list, mint, &TOKEN_PROGRAM_ID)
}

fn submitter_ata(submitter: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(submitter, mint, &TOKEN_PROGRAM_ID)
}

// ─── shared env ──────────────────────────────────────────────────────────────

struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    list: Pubkey,
    mint: Pubkey,
    deposit: u64,
}

/// Fabricate a `CanonList` with the given `listing_window`.
fn setup(listing_window: u64) -> TestEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());

    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    let deposit = 500u64;
    let (list_addr, list_bump) = list_pda(&creator.pubkey(), &RULES_HASH);

    let list = CanonList {
        creator: creator.pubkey(),
        stake_mint: mint,
        fee_mint: mint,
        list_program: TOKEN_PROGRAM_ID,
        rules_hash: RULES_HASH,
        subaccord: Pubkey::default(),
        submit_deposit: deposit,
        challenge_pct: DEFAULT_CHALLENGE_PCT_BPS,
        listing_window,
        withdrawal_timelock: DEFAULT_WITHDRAWAL_TIMELOCK_SECS,
        authority: list_addr,
        item_count: 0,
        dispute_count: 0,
        bump: list_bump,
    };
    let mut buf = Vec::new();
    list.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            list_addr,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    TestEnv {
        ctx,
        list: list_addr,
        mint,
        deposit,
    }
}

fn arm_submitter(env: &mut TestEnv, submitter: &Keypair, balance: u64) {
    env.ctx
        .svm
        .airdrop(&submitter.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let sata = submitter_ata(&submitter.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &sata, &env.mint, &submitter.pubkey(), balance);
    let vata = vault_ata(&env.list, &env.mint);
    if env.ctx.svm.get_account(&vata).is_none() {
        create_token_account(&mut env.ctx, &vata, &env.mint, &env.list, 0);
    }
}

/// Submit an item (dependency: submit_item) → returns the curated account pubkey.
fn submit_item(env: &mut TestEnv, submitter: &Keypair) -> Pubkey {
    let curated = Pubkey::new_unique();
    create_token_account(&mut env.ctx, &curated, &env.mint, &submitter.pubkey(), 0);

    let item = item_pda(&env.list, &curated);
    let sata = submitter_ata(&submitter.pubkey(), &env.mint);
    let vata = vault_ata(&env.list, &env.mint);
    let deposit = env.deposit;
    let ix = env
        .ctx
        .program()
        .accounts(accounts::SubmitItem {
            submitter: submitter.pubkey(),
            list: env.list,
            item,
            account: curated,
            fee_mint: env.mint,
            submitter_token_account: sata,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::SubmitItem { deposit })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[submitter])
        .unwrap()
        .assert_success();
    curated
}

fn do_advance(
    env: &mut TestEnv,
    caller: &Keypair,
    account: &Pubkey,
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, account);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::AdvancePending {
            caller: caller.pubkey(),
            list: env.list,
            item,
        })
        .args(instruction::AdvancePending {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn read_item(env: &TestEnv, account: &Pubkey) -> CanonItem {
    let pda = item_pda(&env.list, account);
    let acc = env.ctx.svm.get_account(&pda).expect("item exists");
    CanonItem::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// Overwrite the on-chain `CanonItem` state (for the Disputed-revert test).
fn set_item_state(env: &mut TestEnv, account: &Pubkey, state: ItemState) {
    let pda = item_pda(&env.list, account);
    let mut item = read_item(env, account);
    item.state = state;
    let mut buf = Vec::new();
    item.try_serialize(&mut buf).unwrap();
    let lamports = env.ctx.svm.get_account(&pda).unwrap().lamports;
    env.ctx
        .svm
        .set_account(
            pda,
            SvmAccount {
                lamports,
                data: buf,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// `listing_window = 0` ⇒ immediately past. Advance succeeds → `Listed`.
#[test]
fn advance_pending_lists_after_window() {
    let mut env = setup(0); // window already elapsed

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);

    // Sanity: item is Pending right after submit.
    assert_eq!(read_item(&env, &curated).state, ItemState::Pending);

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    do_advance(&mut env, &caller, &curated).assert_success();

    assert_eq!(
        read_item(&env, &curated).state,
        ItemState::Listed,
        "item advanced to Listed"
    );
}

/// `listing_window` large ⇒ still open. Advance reverts.
#[test]
fn advance_pending_reverts_before_window() {
    // 1 year — far beyond any test clock.
    let mut env = setup(365 * 24 * 60 * 60);

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_advance(&mut env, &caller, &curated);
    assert!(
        !r.is_success(),
        "advance before window must revert; logs={:?}",
        r.logs()
    );
    assert_eq!(read_item(&env, &curated).state, ItemState::Pending);
}

/// Item is `Disputed` (not `Pending`) → advance reverts.
#[test]
fn advance_pending_reverts_if_disputed() {
    let mut env = setup(0); // window elapsed, but state is wrong

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);

    // Force the item into Disputed (simulates a challenge filed mid-window).
    set_item_state(&mut env, &curated, ItemState::Disputed);

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_advance(&mut env, &caller, &curated);
    assert!(
        !r.is_success(),
        "advance on Disputed must revert; logs={:?}",
        r.logs()
    );
    // State unchanged.
    assert_eq!(read_item(&env, &curated).state, ItemState::Disputed);
}
