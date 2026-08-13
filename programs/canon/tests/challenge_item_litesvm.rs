#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `challenge_item` (bean accord-04m9).
//!
//! The SBPF v0 stack-frame limit is resolved (Solana 3.1.10 / SBPF v3). Two
//! happy-path tests remain `#[ignore]`'d for a DIFFERENT, real reason: Accord's
//! `create_dispute` inits the dispute PDA with the filer (the CanonList PDA,
//! which carries data) as rent-payer. LiteSVM surfaces writable accounts
//! rent-exempt, forcing Anchor's `init` into the allocate+assign+transfer path,
//! and `system::transfer` rejects a data-carrying `from`. On real Solana the
//! fresh PDA is 0-lamport ⇒ `create_account` (which permits a data-carrying
//! payer), so the path is sound — validate via the Surfpool e2e suite.
//!
//! Coverage (TDD acceptance matrix from the bean):
//!   - happy path (Pending item): locks stake+fee, item → Disputed,
//!     dispute created on Accord with options [keep, remove]
//!   - revert: item already Disputed
//!   - revert: insufficient challenger funds

#![allow(dead_code)]

use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
use anchor_litesvm::AnchorLiteSVM;
use canon::state::{CanonItem, CanonList, ItemState};
use canon::{accounts, constants::*, instruction, ID as CANON_ID};
use solana_program::instruction::AccountMeta;
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

fn load_bytes(name: &str) -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/deploy")
        .join(name);
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
}

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

fn list_pda(creator: &Pubkey, rules_hash: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_CANON_LIST, creator.as_ref(), rules_hash], &CANON_ID)
}
fn item_pda(list: &Pubkey, account: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_CANON_ITEM, list.as_ref(), account.as_ref()],
        &CANON_ID,
    )
    .0
}
fn vault_ata(list: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(list, mint, &TOKEN_PROGRAM_ID)
}
fn user_ata(user: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(user, mint, &TOKEN_PROGRAM_ID)
}
fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[accord::SEED_SUBACCORD, creator.as_ref(), risk_type],
        &accord::ID,
    )
}
fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[accord::SEED_PAUSE], &accord::ID).0
}
fn dispute_pda(filer: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[accord::SEED_DISPUTE, filer.as_ref(), &nonce.to_le_bytes()],
        &accord::ID,
    )
    .0
}

struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    list: Pubkey,
    subaccord: Pubkey,
    mint: Pubkey,
    deposit: u64,
    fee_per_juror: u64,
}

fn setup() -> TestEnv {
    let programs: &[(Pubkey, &[u8])] = &[
        (CANON_ID, &load_bytes("canon.so")),
        (accord::ID, &load_bytes("accord.so")),
    ];
    let ctx = AnchorLiteSVM::build_with_programs(programs);
    let mut ctx = ctx;

    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    // Accord Subaccord.
    let risk_type = RULES_HASH;
    let (sub_addr, sub_bump) = subaccord_pda(&creator.pubkey(), &risk_type);
    let fee_per_juror = DEFAULT_FEE_PER_JUROR;
    let sub = accord::Subaccord {
        creator: creator.pubkey(),
        staking_token: mint,
        fee_token: mint,
        min_stake: 1_000,
        alpha_bps: DEFAULT_ALPHA_BPS,
        review_window: DEFAULT_REVIEW_WINDOW_SECS,
        commit_window: DEFAULT_COMMIT_WINDOW_SECS,
        reveal_window: DEFAULT_REVEAL_WINDOW_SECS,
        appeal_window: DEFAULT_APPEAL_WINDOW_SECS,
        max_appeals: DEFAULT_MAX_APPEALS,
        min_jury_size: 3,
        aggregation: accord::state::Aggregation::Plurality,
        fee_per_juror,
        reveal_threshold_bps: 6_666,
        shortfall_policy: accord::state::ShortfallPolicy::Redraw,
        max_draw_attempts: 3,
        authority: Pubkey::default(),
        evidence_operator: Pubkey::default(),
        risk_type,
        evidence_spec: [0u8; 32],
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
        staker_count: 3,
        root_hash: [0u8; 32],
        total_stake: 0,
        next_index: 0,
        depth: 4,
        fee_vault_deposited: 0,
        fee_vault_withdrawn: 0,
        stake_vault_deposited: 0,
        stake_vault_withdrawn: 0,
        free_head: u32::MAX,
        bump: sub_bump,
    };
    let mut buf = Vec::new();
    sub.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            sub_addr,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: accord::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // Accord PauseState (unpaused).
    let pause = pause_pda();
    let ps = accord::state::PauseState {
        authority: creator.pubkey(),
        paused: false,
        pending_unpause_after: None,
        bump: Pubkey::find_program_address(&[accord::SEED_PAUSE], &accord::ID).1,
    };
    let mut buf = Vec::new();
    ps.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            pause,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: accord::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // Accord fee_vault (pre-created, 0 balance).
    let fee_vault = vault_ata(&sub_addr, &mint);
    create_token_account(&mut ctx, &fee_vault, &mint, &sub_addr, 0);

    // CanonList.
    let deposit = DEFAULT_SUBMIT_DEPOSIT;
    let (list_addr, list_bump) = list_pda(&creator.pubkey(), &RULES_HASH);
    let list = CanonList {
        creator: creator.pubkey(),
        stake_mint: mint,
        fee_mint: mint,
        list_program: TOKEN_PROGRAM_ID,
        rules_hash: RULES_HASH,
        subaccord: sub_addr,
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
        subaccord: sub_addr,
        mint,
        deposit,
        fee_per_juror,
    }
}

fn arm_user(env: &mut TestEnv, user: &Keypair, balance: u64) {
    env.ctx
        .svm
        .airdrop(&user.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let uata = user_ata(&user.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &uata, &env.mint, &user.pubkey(), balance);
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
            evidence: [0xAA; 32],
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

fn do_challenge(
    env: &mut TestEnv,
    challenger: &Keypair,
    account: &Pubkey,
    evidence: [u8; 32],
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, account);
    let cata = user_ata(&challenger.pubkey(), &env.mint);
    let vata = vault_ata(&env.list, &env.mint);
    let dispute = dispute_pda(&env.list, 0);
    let pause = pause_pda();
    let fee_vault = vault_ata(&env.subaccord, &env.mint);
    let mut ix = env
        .ctx
        .program()
        .accounts(accounts::ChallengeItem {
            challenger: challenger.pubkey(),
            list: env.list,
            item,
            subaccord: env.subaccord,
            fee_mint: env.mint,
            challenger_token_account: cata,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: SYS_PROGRAM_ID,
        })
        .args(instruction::ChallengeItem { evidence })
        .instruction()
        .unwrap();
    ix.accounts.extend(vec![
        AccountMeta::new(dispute, false),
        AccountMeta::new_readonly(pause, false),
        AccountMeta::new(fee_vault, false),
        AccountMeta::new_readonly(accord::ID, false),
    ]);
    env.ctx.execute_instruction(ix, &[challenger]).unwrap()
}

fn read_item(env: &TestEnv, account: &Pubkey) -> CanonItem {
    let pda = item_pda(&env.list, account);
    let acc = env.ctx.svm.get_account(&pda).expect("item exists");
    CanonItem::try_deserialize(&mut &acc.data[..]).unwrap()
}

// ─── Tests ─────────────────────────────────────────────────────────────────

/// Happy path: challenge a Pending item. Locks stake + fee, item → Disputed,
/// dispute created on Accord.
#[test]
#[ignore = "LiteSVM: Accord inits the dispute PDA from the data-carrying filer (CanonList PDA); LiteSVM rent-exempts writable accounts → Anchor init takes system::transfer, which rejects a data-carrying `from`. Validate via Surfpool e2e."]
fn challenge_item_happy_locks_stake_fee_and_creates_dispute() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);
    assert_eq!(read_item(&env, &curated).state, ItemState::Pending);

    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let evidence = [0xBB; 32];
    do_challenge(&mut env, &challenger, &curated, evidence).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Disputed);
    assert_eq!(item.challenger, challenger.pubkey());
    assert_eq!(item.challenge_count, 1);
    let expected_challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    assert_eq!(item.challenge_stake, expected_challenge_stake);

    // Dispute created on Accord.
    let dispute_addr = dispute_pda(&env.list, 0);
    let acc = env
        .ctx
        .svm
        .get_account(&dispute_addr)
        .expect("dispute exists");
    let dispute = accord::state::Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!(dispute.filer, env.list);
    assert_eq!(dispute.num_options, 2);
    assert_eq!(dispute.options[0], OPTION_KEEP);
    assert_eq!(dispute.options[1], OPTION_REMOVE);
    assert_eq!(dispute.evidence_hashes[0], evidence);
}

/// Revert: item already Disputed.
#[test]
#[ignore = "LiteSVM: same data-carrying filer rent-payer limitation as the happy path; first challenge must succeed to test the revert."]
fn challenge_item_reverts_if_already_disputed() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    do_challenge(&mut env, &challenger, &curated, [0xBB; 32]).assert_success();
    let challenger2 = Keypair::new();
    arm_user(&mut env, &challenger2, 10_000);
    let r = do_challenge(&mut env, &challenger2, &curated, [0xCC; 32]);
    assert!(!r.is_success(), "challenge on Disputed must revert");
}

/// Revert: insufficient challenger funds.
#[test]
fn challenge_item_reverts_on_insufficient_funds() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = submit_item(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 1);
    let r = do_challenge(&mut env, &challenger, &curated, [0xDD; 32]);
    assert!(!r.is_success(), "insufficient funds must revert");
    assert_eq!(read_item(&env, &curated).state, ItemState::Pending);
}
