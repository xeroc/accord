#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `request_withdrawal` + `advance_withdrawal` (bean accord-d7k2).
//!
//! Coverage (TDD acceptance matrix):
//!   - request_withdrawal: Listed → WithdrawPending, timestamp set
//!   - request_withdrawal: reverts if not Listed (Pending)
//!   - request_withdrawal: reverts if not submitter
//!   - advance_withdrawal: after timelock → returns stake, item Removed
//!   - advance_withdrawal: reverts before timelock
//!   - advance_withdrawal: reverts if not WithdrawPending

use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
use anchor_litesvm::AnchorLiteSVM;
use canon::state::{CanonItem, CanonList, ItemState};
use canon::{accounts, constants::*, instruction, ID as CANON_ID};
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
const RULES_HASH: [u8; 32] = {
    let mut h = [0u8; 32];
    h[0] = 0xAB;
    h
};

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/canon.so");
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
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
    Pack::pack(
        SplTokenAccount {
            mint: *mint,
            owner: *owner,
            amount,
            delegate: COption::None,
            state: AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut buf,
    )
    .unwrap();
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

fn list_pda(creator: &Pubkey, rh: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_CANON_LIST, creator.as_ref(), rh], &CANON_ID)
}
fn item_pda(list: &Pubkey, acct: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_CANON_ITEM, list.as_ref(), acct.as_ref()], &CANON_ID).0
}
fn vault_ata(list: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(list, mint, &TOKEN_PROGRAM_ID)
}
fn user_ata(u: &Pubkey, m: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(u, m, &TOKEN_PROGRAM_ID)
}

struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    list: Pubkey,
    mint: Pubkey,
    deposit: u64,
}

fn setup(withdrawal_timelock: u64) -> TestEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(CANON_ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
    let deposit = DEFAULT_SUBMIT_DEPOSIT;
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
        listing_window: 0, // immediately past so make_listed works
        withdrawal_timelock,
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
                owner: CANON_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let canon_vault = vault_ata(&list_addr, &mint);
    create_token_account(&mut ctx, &canon_vault, &mint, &list_addr, 0);
    TestEnv {
        ctx,
        list: list_addr,
        mint,
        deposit,
    }
}

fn arm_user(env: &mut TestEnv, user: &Keypair, balance: u64) {
    env.ctx
        .svm
        .airdrop(&user.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    create_token_account(
        &mut env.ctx,
        &user_ata(&user.pubkey(), &env.mint),
        &env.mint,
        &user.pubkey(),
        balance,
    );
}

fn submit_item(env: &mut TestEnv, submitter: &Keypair) -> Pubkey {
    let curated = Pubkey::new_unique();
    create_token_account(&mut env.ctx, &curated, &env.mint, &submitter.pubkey(), 0);
    let item = item_pda(&env.list, &curated);
    let sata = user_ata(&submitter.pubkey(), &env.mint);
    let vata = vault_ata(&env.list, &env.mint);
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
            system_program: SYS_PROGRAM_ID,
        })
        .args(instruction::SubmitItem {
            deposit: env.deposit,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[submitter])
        .unwrap()
        .assert_success();
    curated
}

/// Submit + advance_pending to get a Listed item.
fn make_listed(env: &mut TestEnv, submitter: &Keypair) -> Pubkey {
    let curated = submit_item(env, submitter);
    let item = item_pda(&env.list, &curated);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
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
    env.ctx
        .execute_instruction(ix, &[&caller])
        .unwrap()
        .assert_success();
    curated
}

fn do_request(
    env: &mut TestEnv,
    submitter: &Keypair,
    curated: &Pubkey,
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, curated);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::RequestWithdrawal {
            submitter: submitter.pubkey(),
            list: env.list,
            item,
        })
        .args(instruction::RequestWithdrawal {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[submitter]).unwrap()
}

fn do_advance(
    env: &mut TestEnv,
    caller: &Keypair,
    curated: &Pubkey,
    submitter: &Keypair,
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, curated);
    let sata = user_ata(&submitter.pubkey(), &env.mint);
    let vata = vault_ata(&env.list, &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::AdvanceWithdrawal {
            caller: caller.pubkey(),
            list: env.list,
            item,
            fee_mint: env.mint,
            submitter_token_account: sata,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::AdvanceWithdrawal {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn read_item(env: &TestEnv, curated: &Pubkey) -> CanonItem {
    let pda = item_pda(&env.list, curated);
    let acc = env.ctx.svm.get_account(&pda).expect("item exists");
    CanonItem::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_vault(env: &TestEnv) -> u64 {
    let vata = vault_ata(&env.list, &env.mint);
    SplTokenAccount::unpack(&env.ctx.svm.get_account(&vata).unwrap().data)
        .unwrap()
        .amount
}

fn read_user_balance(env: &TestEnv, user: &Pubkey) -> u64 {
    let uata = user_ata(user, &env.mint);
    SplTokenAccount::unpack(&env.ctx.svm.get_account(&uata).unwrap().data)
        .unwrap()
        .amount
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[test]
fn request_withdrawal_flips_listed_to_pending() {
    let mut env = setup(DEFAULT_WITHDRAWAL_TIMELOCK_SECS);
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    assert_eq!(read_item(&env, &curated).state, ItemState::Listed);

    do_request(&mut env, &submitter, &curated).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::WithdrawPending);
    assert!(item.withdrawal_requested_at.is_some());
}

#[test]
fn request_withdrawal_reverts_if_pending() {
    let mut env = setup(DEFAULT_WITHDRAWAL_TIMELOCK_SECS);
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter); // Pending, not Listed

    let r = do_request(&mut env, &submitter, &curated);
    assert!(
        !r.is_success(),
        "request on Pending must revert; logs={:?}",
        r.logs()
    );
    assert_eq!(read_item(&env, &curated).state, ItemState::Pending);
}

#[test]
fn request_withdrawal_reverts_if_not_submitter() {
    let mut env = setup(DEFAULT_WITHDRAWAL_TIMELOCK_SECS);
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);

    let attacker = Keypair::new();
    env.ctx
        .svm
        .airdrop(&attacker.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_request(&mut env, &attacker, &curated);
    assert!(
        !r.is_success(),
        "request by non-submitter must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn advance_withdrawal_returns_stake_after_timelock() {
    let mut env = setup(0); // timelock = 0 → immediately past
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    do_request(&mut env, &submitter, &curated).assert_success();

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();

    let vault_before = read_vault(&env);
    let user_before = read_user_balance(&env, &submitter.pubkey());

    do_advance(&mut env, &caller, &curated, &submitter).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Removed);
    assert_eq!(item.accumulated_stake, 0);
    assert_eq!(
        read_vault(&env),
        vault_before - env.deposit,
        "vault decremented"
    );
    assert_eq!(
        read_user_balance(&env, &submitter.pubkey()),
        user_before + env.deposit,
        "submitter received stake"
    );
}

#[test]
fn advance_withdrawal_reverts_before_timelock() {
    let mut env = setup(365 * 24 * 60 * 60); // 1 year
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    do_request(&mut env, &submitter, &curated).assert_success();

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_advance(&mut env, &caller, &curated, &submitter);
    assert!(
        !r.is_success(),
        "advance before timelock must revert; logs={:?}",
        r.logs()
    );
    assert_eq!(read_item(&env, &curated).state, ItemState::WithdrawPending);
}

#[test]
fn advance_withdrawal_reverts_if_listed() {
    let mut env = setup(0);
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    // Don't request withdrawal — item is Listed.

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_advance(&mut env, &caller, &curated, &submitter);
    assert!(
        !r.is_success(),
        "advance on Listed must revert; logs={:?}",
        r.logs()
    );
}
