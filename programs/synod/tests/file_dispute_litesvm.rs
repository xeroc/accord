#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `file_dispute` (SPEC §Instructions #3).
//!
//! Coverage (TDD acceptance matrix from the bean + milestone §6):
//!   - happy path + vault invariant: #[ignore] in LiteSVM — same
//!     rent-payer quirk as canon `challenge_item` (Accord's `create_dispute`
//!     inits the dispute PDA with the data-carrying case PDA as payer;
//!     LiteSVM surfaces writable accounts rent-exempt, forcing Anchor into
//!     allocate+assign+transfer, and `system::transfer` rejects a
//!     data-carrying `from`. Sound on real Solana — the Surfpool e2e suite
//!     validates it). Assertions live inside for the e2e to mirror.
//!   - revert: incomplete roster -> RosterIncomplete
//!   - revert: state != Opening (double-file) -> NotOpening
//!   - revert: wrong dispute PDA -> DisputePdaMismatch
//!   - revert: wrong accord program -> WrongAccordProgram
//!   - revert: missing remaining accounts -> MissingRemainingAccounts
//!
//! The 7-party options len == 8 + hash derivation vectors are pinned by the
//! host unit tests next to the derivation helpers in
//! `src/instructions/file_dispute.rs`.

use accord::state::{Aggregation, ShortfallPolicy, Subaccord};
use accord::ID as ACCORD_ID;
use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
use anchor_litesvm::AnchorLiteSVM;
use solana_program::clock::Clock;
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
use synod::state::{CaseState, SynodCase};
use synod::{accounts, constants::*, instruction, ID as SYNOD_ID};

const SPL_RENT: u64 = 1_000_000_000;
const STAKE: u64 = 1_000;
const FEE_PER_JUROR: u64 = 10;
const MIN_JURY_SIZE: u32 = 3;

fn load_so(name: &str) -> Vec<u8> {
    let so =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../target/deploy/{name}.so"));
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
}

fn now(ctx: &anchor_litesvm::AnchorContext) -> i64 {
    ctx.svm.get_sysvar::<Clock>().unix_timestamp
}

fn case_pda(opener: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_CASE, opener.as_ref(), &nonce.to_le_bytes()],
        &SYNOD_ID,
    )
    .0
}

fn party_ata(party: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(party, mint, &TOKEN_PROGRAM_ID)
}

fn vault_ata(case: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(case, mint, &TOKEN_PROGRAM_ID)
}

fn create_mint(ctx: &mut anchor_litesvm::AnchorContext, mint: &Pubkey) {
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

fn create_token_account(
    ctx: &mut anchor_litesvm::AnchorContext,
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
    ctx.svm
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

fn assert_code(r: &anchor_litesvm::TransactionResult, code: &str) {
    assert!(
        !r.is_success(),
        "must fail with {code}; logs={:?}",
        r.logs()
    );
    assert!(
        r.logs().join("\n").contains(code),
        "expected error code {code}; logs={:?}",
        r.logs()
    );
}

struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    opener: Keypair,
    party1: Keypair,
    party2: Keypair,
    case: Pubkey,
    subaccord: Pubkey,
    accord_state: Pubkey,
    fee_vault: Pubkey,
    mint: Pubkey,
}

impl TestEnv {
    fn parties(&self) -> Vec<Pubkey> {
        vec![
            self.opener.pubkey(),
            self.party1.pubkey(),
            self.party2.pubkey(),
        ]
    }
}

/// Both programs deployed + fabricated accord-side accounts (Subaccord with
/// `staker_count >= min_jury_size` so the create_dispute intake gate passes,
/// unpaused AccordState, empty fee_vault) — mirror of canon challenge_item.
fn setup_env() -> TestEnv {
    let programs: &[(Pubkey, &[u8])] = &[
        (SYNOD_ID, &load_so("synod")),
        (ACCORD_ID, &load_so("accord")),
    ];
    let mut ctx = AnchorLiteSVM::build_with_programs(programs);

    let opener = Keypair::new();
    ctx.svm
        .airdrop(&opener.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    // Accord Subaccord (fabricated, accord-owned).
    let subaccord = Pubkey::new_unique();
    let sub = Subaccord {
        creator: opener.pubkey(),
        staking_token: mint,
        fee_token: mint,
        min_stake: 1_000,
        alpha_bps: 1_000,
        review_window: 7 * 24 * 3600,
        commit_window: 2 * 24 * 3600,
        reveal_window: 2 * 24 * 3600,
        appeal_window: 3 * 24 * 3600,
        max_appeals: 3,
        min_jury_size: MIN_JURY_SIZE,
        aggregation: Aggregation::Plurality,
        fee_per_juror: FEE_PER_JUROR,
        reveal_threshold_bps: 6_666,
        shortfall_policy: ShortfallPolicy::Redraw,
        max_draw_attempts: 3,
        coherence_tol_bps: 0,
        authority: Pubkey::default(),
        evidence_operator: Pubkey::default(),
        domain_ref: [0u8; 32],
        evidence_spec: [0u8; 32],
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
        staker_count: MIN_JURY_SIZE,
        root_hash: [0u8; 32],
        total_stake: 0,
        next_index: 0,
        depth: 4,
        fee_vault_deposited: 0,
        fee_vault_withdrawn: 0,
        stake_vault_deposited: 0,
        stake_vault_withdrawn: 0,
        free_head: u32::MAX,
        bump: 254,
    };
    let mut buf = Vec::new();
    sub.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            subaccord,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: ACCORD_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // AccordState (unpaused).
    let (accord_state, state_bump) = accord::accord_state_pda();
    let st = accord::state::AccordState {
        authority: opener.pubkey(),
        paused: false,
        pending_unpause_after: None,
        bump: state_bump,
    };
    let mut buf = Vec::new();
    st.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            accord_state,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: ACCORD_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    // Accord fee_vault (pre-created, 0 balance) — Subaccord PDA's ATA.
    let fee_vault = vault_ata(&subaccord, &mint);
    create_token_account(&mut ctx, &fee_vault, &mint, &subaccord, 0);

    let case = case_pda(&opener.pubkey(), 0);
    TestEnv {
        ctx,
        opener,
        party1: Keypair::new(),
        party2: Keypair::new(),
        case,
        subaccord,
        accord_state,
        fee_vault,
        mint,
    }
}

fn open_and_join(env: &mut TestEnv, joined: usize) {
    let opener = env.opener.insecure_clone();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::OpenCase {
            opener: opener.pubkey(),
            subaccord: env.subaccord,
            case: env.case,
            system_program: system_program::ID,
        })
        .args(instruction::OpenCase {
            parties: env.parties(),
            stake: STAKE,
            join_deadline: now(&env.ctx) + 3600,
            nonce: 0,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&opener])
        .unwrap()
        .assert_success();

    let roster = [
        opener.insecure_clone(),
        env.party1.insecure_clone(),
        env.party2.insecure_clone(),
    ];
    for kp in roster.iter().take(joined) {
        env.ctx.svm.expire_blockhash();
        env.ctx
            .svm
            .airdrop(&kp.pubkey(), 50 * LAMPORTS_PER_SOL)
            .unwrap();
        let ata = party_ata(&kp.pubkey(), &env.mint);
        create_token_account(&mut env.ctx, &ata, &env.mint, &kp.pubkey(), STAKE);
        let ix = env
            .ctx
            .program()
            .accounts(accounts::Join {
                party: kp.pubkey(),
                case: env.case,
                subaccord: env.subaccord,
                fee_mint: env.mint,
                party_token_account: ata,
                vault: vault_ata(&env.case, &env.mint),
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: spl_associated_token_account::ID,
                system_program: system_program::ID,
            })
            .args(instruction::Join {
                evidence_hash: [kp.pubkey().as_ref()[0]; 32],
            })
            .instruction()
            .unwrap();
        env.ctx
            .execute_instruction(ix, &[kp])
            .unwrap()
            .assert_success();
    }
}

/// Build + send `file_dispute` with the given remaining accounts
/// (defaults: correct dispute PDA, accord_state, fee_vault, accord program).
fn do_file(
    env: &mut TestEnv,
    caller: &Keypair,
    dispute: Option<Pubkey>,
    program: Option<Pubkey>,
    with_rem: bool,
) -> anchor_litesvm::TransactionResult {
    env.ctx.svm.expire_blockhash();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let vata = vault_ata(&env.case, &env.mint);
    let mut ix = env
        .ctx
        .program()
        .accounts(accounts::FileDispute {
            caller: caller.pubkey(),
            case: env.case,
            opener: env.opener.pubkey(),
            subaccord: env.subaccord,
            fee_mint: env.mint,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::FileDispute { nonce: 0 })
        .instruction()
        .unwrap();
    if with_rem {
        let dispute = dispute.unwrap_or_else(|| accord::dispute_pda(&env.case, 0).0);
        ix.accounts.extend(vec![
            AccountMeta::new(dispute, false),
            AccountMeta::new_readonly(env.accord_state, false),
            AccountMeta::new(env.fee_vault, false),
            AccountMeta::new_readonly(program.unwrap_or(ACCORD_ID), false),
        ]);
    }
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn read_case(env: &TestEnv) -> SynodCase {
    let acc = env.ctx.svm.get_account(&env.case).expect("case exists");
    SynodCase::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn vault_balance(env: &TestEnv) -> u64 {
    let vata = vault_ata(&env.case, &env.mint);
    let acc = env.ctx.svm.get_account(&vata).expect("vault exists");
    SplTokenAccount::unpack(&acc.data).unwrap().amount
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// Happy path: dispute PDA bound, state Live, vault == N·S − fee, dispute
/// filed at Accord with N+1 options. #[ignore] in LiteSVM (rent-payer quirk —
/// see module doc); the Surfpool e2e suite runs this scenario for real.
#[test]
#[ignore = "LiteSVM: data-carrying case-PDA rent-payer (canon challenge_item note) — e2e validates"]
fn file_dispute_happy_binds_dispute_and_locks_fee() {
    let mut env = setup_env();
    open_and_join(&mut env, 3);
    let caller = Keypair::new();
    env.ctx.svm.expire_blockhash();

    let r = do_file(&mut env, &caller, None, None, true);
    r.assert_success();

    let case = read_case(&env);
    let dispute = accord::dispute_pda(&env.case, 0).0;
    assert_eq!(case.dispute, dispute, "dispute PDA bound");
    assert_eq!(case.state, CaseState::Live);
    assert_eq!(
        vault_balance(&env),
        3 * STAKE - MIN_JURY_SIZE as u64 * FEE_PER_JUROR
    );
}

/// Incomplete roster (2 of 3 joined) -> RosterIncomplete. No deadline wait is
/// relevant: the gate is purely the bitmask.
#[test]
fn file_dispute_reverts_on_incomplete_roster() {
    let mut env = setup_env();
    open_and_join(&mut env, 2);
    let caller = Keypair::new();
    let r = do_file(&mut env, &caller, None, None, true);
    assert_code(&r, "RosterIncomplete");
}

/// Double file: state already Live -> NotOpening (check-and-set gate).
#[test]
fn file_dispute_reverts_when_not_opening() {
    let mut env = setup_env();
    open_and_join(&mut env, 3);
    let mut case = read_case(&env);
    case.state = CaseState::Live; // simulate a prior successful file
    let mut buf = Vec::new();
    case.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            env.case,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: SYNOD_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let caller = Keypair::new();
    let r = do_file(&mut env, &caller, None, None, true);
    assert_code(&r, "NotOpening");
}

/// Wrong dispute account in remaining_accounts -> DisputePdaMismatch (the
/// dispute must be accord's ["dispute", case, 0]).
#[test]
fn file_dispute_reverts_on_wrong_dispute_pda() {
    let mut env = setup_env();
    open_and_join(&mut env, 3);
    let caller = Keypair::new();
    let r = do_file(&mut env, &caller, Some(Pubkey::new_unique()), None, true);
    assert_code(&r, "DisputePdaMismatch");
}

/// Wrong accord program account -> WrongAccordProgram.
#[test]
fn file_dispute_reverts_on_wrong_accord_program() {
    let mut env = setup_env();
    open_and_join(&mut env, 3);
    let caller = Keypair::new();
    let r = do_file(&mut env, &caller, None, Some(Pubkey::new_unique()), true);
    assert_code(&r, "WrongAccordProgram");
}

/// No remaining accounts -> MissingRemainingAccounts.
#[test]
fn file_dispute_reverts_on_missing_remaining_accounts() {
    let mut env = setup_env();
    open_and_join(&mut env, 3);
    let caller = Keypair::new();
    let r = do_file(&mut env, &caller, None, None, false);
    assert_code(&r, "MissingRemainingAccounts");
}
