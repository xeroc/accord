#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `submit_item` (bean accord-7tsl).
//!
//! Coverage (TDD acceptance matrix from the bean):
//!   - happy path (ownership match): deposit locked, item `Pending`,
//!     `accumulated_stake == deposit`, `submitter == signer`, `item_count`++
//!   - sentinel `list_program`: works for arbitrary base58 `account` (no
//!     ownership check)
//!   - revert: owner mismatch (`account.owner != list_program`)
//!   - revert: duplicate item (PDA collision on second `submit_item`)
//!
//! `create_list` is not built yet (bean accord-73yx), so the `CanonList`
//! account is fabricated directly in the SVM (discriminator + fields), the same
//! way the accord accumulator tests fabricate mint/token accounts. One fresh
//! `AnchorLiteSVM` context per test.

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

const SYS_PROGRAM_ID: Pubkey = system_program::ID;

const SPL_RENT: u64 = 1_000_000_000;

/// Fixed test rules_hash (seed component; value is arbitrary for these tests).
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

// ─── SPL fabrication helpers (mirror programs/accord/tests/accumulator_litesvm) ─

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

/// Fabricate a system-owned account (owner = system_program) — used as an
/// arbitrary "curated account" whose owner does NOT match a token-program
/// `list_program` (for the mismatch-revert test) or as a dummy account for the
/// sentinel case.
fn create_system_account(svm: &mut anchor_litesvm::AnchorContext, addr: &Pubkey, lamports: u64) {
    svm.svm
        .set_account(
            *addr,
            SvmAccount {
                lamports,
                data: Vec::new(),
                owner: SYS_PROGRAM_ID,
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

/// Build a full test env with a fabricated `CanonList`.
/// `list_program` = the program that must own curated accounts (`Pubkey::default()`
/// = sentinel, ownership check disabled).
fn setup(list_program: Pubkey) -> TestEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());

    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    let deposit = 500u64;
    let (list_addr, list_bump) = list_pda(&creator.pubkey(), &RULES_HASH);

    // Fabricate the CanonList account (create_list is not built yet).
    let list = CanonList {
        creator: creator.pubkey(),
        stake_mint: mint,
        fee_mint: mint,
        list_program,
        rules_hash: RULES_HASH,
        subaccord: Pubkey::default(),
        submit_deposit: deposit,
        challenge_pct: DEFAULT_CHALLENGE_PCT_BPS,
        listing_window: DEFAULT_LISTING_WINDOW_SECS,
        withdrawal_timelock: DEFAULT_WITHDRAWAL_TIMELOCK_SECS,
        authority: Pubkey::default(),
        item_count: 0,
        bump: list_bump,
    };
    let mut buf = Vec::new();
    list.try_serialize(&mut buf).unwrap();
    let lamports = LAMPORTS_PER_SOL.max(SPL_RENT);
    ctx.svm
        .set_account(
            list_addr,
            SvmAccount {
                lamports,
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

/// Fund a submitter: SOL + funded `fee_mint` ATA + pre-created vault ATA.
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

fn do_submit(
    env: &mut TestEnv,
    submitter: &Keypair,
    account: &Pubkey,
    evidence: [u8; 32],
    deposit: u64,
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, account);
    let sata = submitter_ata(&submitter.pubkey(), &env.mint);
    let vata = vault_ata(&env.list, &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::SubmitItem {
            submitter: submitter.pubkey(),
            list: env.list,
            item,
            account: *account,
            fee_mint: env.mint,
            submitter_token_account: sata,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: SYS_PROGRAM_ID,
        })
        .args(instruction::SubmitItem { evidence, deposit })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[submitter]).unwrap()
}

fn read_item(env: &TestEnv, account: &Pubkey) -> CanonItem {
    let pda = item_pda(&env.list, account);
    let acc = env.ctx.svm.get_account(&pda).expect("item exists");
    CanonItem::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_list(env: &TestEnv) -> CanonList {
    let acc = env.ctx.svm.get_account(&env.list).expect("list exists");
    CanonList::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_vault_balance(env: &TestEnv) -> u64 {
    let vata = vault_ata(&env.list, &env.mint);
    let acc = env.ctx.svm.get_account(&vata).expect("vault exists");
    let ta = SplTokenAccount::unpack(&acc.data).unwrap();
    ta.amount
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// Happy path: `list_program = TOKEN_PROGRAM_ID`; the curated `account` is a
/// real token account owned by TOKEN_PROGRAM_ID. Deposit locks, item is Pending,
/// accumulated_stake == deposit, item_count increments.
#[test]
fn submit_item_happy_locks_deposit_and_inits_pending() {
    let mut env = setup(TOKEN_PROGRAM_ID);

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);

    // The curated account: a token account owned by TOKEN_PROGRAM_ID.
    let curated = Pubkey::new_unique();
    create_token_account(&mut env.ctx, &curated, &env.mint, &submitter.pubkey(), 0);

    let evidence = [0xAA; 32];
    let deposit = env.deposit;
    do_submit(&mut env, &submitter, &curated, evidence, deposit).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.account, curated);
    assert_eq!(item.list, env.list);
    assert_eq!(item.submitter, submitter.pubkey());
    assert_eq!(item.state, ItemState::Pending);
    assert_eq!(item.accumulated_stake, deposit);
    assert_eq!(item.challenge_count, 0);
    assert_eq!(item.active_dispute, Pubkey::default());
    assert_eq!(item.withdrawal_requested_at, None);

    assert_eq!(read_vault_balance(&env), deposit, "deposit locked in vault");

    let list = read_list(&env);
    assert_eq!(list.item_count, 1, "item_count incremented");
}

/// Sentinel list_program (Pubkey::default()): ownership check disabled; an
/// arbitrary base58 account (system-owned) is accepted.
#[test]
fn submit_item_sentinel_accepts_arbitrary_account() {
    let mut env = setup(Pubkey::default()); // sentinel

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);

    // Arbitrary account: a system-owned dummy (owner = system_program, which
    // would fail a real ownership check — but the sentinel disables it).
    let curated = Pubkey::new_unique();
    create_system_account(&mut env.ctx, &curated, LAMPORTS_PER_SOL);

    let deposit = env.deposit;
    do_submit(&mut env, &submitter, &curated, [0xBB; 32], deposit).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Pending);
    assert_eq!(item.accumulated_stake, deposit);
    assert_eq!(item.account, curated);
}

/// Owner mismatch: `list_program = TOKEN_PROGRAM_ID` but the curated account is
/// system-owned → reverts.
#[test]
fn submit_item_reverts_on_owner_mismatch() {
    let mut env = setup(TOKEN_PROGRAM_ID);

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);

    // System-owned account: owner = system_program != TOKEN_PROGRAM_ID.
    let curated = Pubkey::new_unique();
    create_system_account(&mut env.ctx, &curated, LAMPORTS_PER_SOL);

    let deposit = env.deposit;
    let r = do_submit(&mut env, &submitter, &curated, [0xCC; 32], deposit);
    assert!(
        !r.is_success(),
        "owner mismatch must revert; logs={:?}",
        r.logs()
    );

    // No item created.
    let pda = item_pda(&env.list, &curated);
    assert!(env.ctx.svm.get_account(&pda).is_none(), "no item on revert");
}

/// Duplicate item: submitting the same account twice collides on the
/// `["canon-item", list, account]` PDA → second submit reverts (init collision).
#[test]
fn submit_item_reverts_on_duplicate() {
    let mut env = setup(TOKEN_PROGRAM_ID);

    let submitter = Keypair::new();
    arm_submitter(&mut env, &submitter, 10_000);

    let curated = Pubkey::new_unique();
    create_token_account(&mut env.ctx, &curated, &env.mint, &submitter.pubkey(), 0);

    let deposit = env.deposit;
    // First submit succeeds.
    do_submit(&mut env, &submitter, &curated, [0xDD; 32], deposit).assert_success();

    // Second submit collides on the PDA.
    let r = do_submit(&mut env, &submitter, &curated, [0xEE; 32], deposit);
    assert!(
        !r.is_success(),
        "duplicate item must revert; logs={:?}",
        r.logs()
    );

    // item_count still 1.
    let list = read_list(&env);
    assert_eq!(list.item_count, 1);
}
