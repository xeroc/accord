#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `join` (SPEC §Instructions #2).
//!
//! Coverage (TDD acceptance matrix from the bean + milestone §6):
//!   - happy: all parties join -> `joined` bitmask fills, each evidence hash
//!     lands in its own slot, vault == N·S
//!   - revert: non-named wallet joins -> NotNamedParty
//!   - revert: double join -> AlreadyJoined
//!   - revert: join at/after `join_deadline` -> JoinDeadlinePassed
//!   - revert: join when state == Live -> NotOpening
//!
//! Happy path runs `open_case` for real (dependency); the deadline and
//! Live-state gates fabricate the `SynodCase` state directly in the SVM (canon
//! parent-fabrication pattern) so they don't depend on clock manipulation or
//! `file_dispute`.

use accord::state::{Aggregation, ShortfallPolicy, Subaccord};
use accord::ID as ACCORD_ID;
use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
use anchor_litesvm::AnchorLiteSVM;
use solana_program::clock::Clock;
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

fn setup() -> anchor_litesvm::AnchorContext {
    AnchorLiteSVM::build_with_program(SYNOD_ID, &load_so("synod"))
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

// ─── SPL fabrication helpers (mirror canon submit_item_litesvm) ─────────────

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

/// Fabricate an accord-owned `Subaccord` at `addr` with the given fee token
/// (ledger fields zeroed — `join` reads only `fee_token` via the mint check).
fn fabricate_subaccord(ctx: &mut anchor_litesvm::AnchorContext, addr: &Pubkey, fee_token: Pubkey) {
    let sub = Subaccord {
        creator: Pubkey::default(),
        staking_token: Pubkey::new_unique(),
        fee_token,
        min_stake: 0,
        alpha_bps: 0,
        review_window: 0,
        commit_window: 0,
        reveal_window: 0,
        appeal_window: 0,
        max_appeals: 0,
        min_jury_size: MIN_JURY_SIZE,
        aggregation: Aggregation::Plurality,
        fee_per_juror: FEE_PER_JUROR,
        reveal_threshold_bps: 0,
        shortfall_policy: ShortfallPolicy::Redraw,
        max_draw_attempts: 0,
        coherence_tol_bps: 0,
        authority: Pubkey::default(),
        evidence_operator: Pubkey::default(),
        domain_ref: [0u8; 32],
        evidence_spec: [0u8; 32],
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
        staker_count: 0,
        root_hash: [0u8; 32],
        total_stake: 0,
        next_index: 0,
        depth: 8,
        fee_vault_deposited: 0,
        fee_vault_withdrawn: 0,
        stake_vault_deposited: 0,
        stake_vault_withdrawn: 0,
        free_head: u32::MAX,
        bump: 254,
        padding: [0; 64],
    };
    let mut buf = Vec::new();
    sub.try_serialize(&mut buf).unwrap();
    ctx.svm
        .set_account(
            *addr,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: ACCORD_ID,
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

// ─── shared env ──────────────────────────────────────────────────────────────

/// Shared env: opener + party keypairs + a real `open_case` case against a
/// fabricated Subaccord whose `fee_token` is `mint`.
struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    opener: Keypair,
    party1: Keypair,
    party2: Keypair,
    case: Pubkey,
    subaccord: Pubkey,
    mint: Pubkey,
}

impl TestEnv {
    /// Roster in naming order (opener first, index 0).
    fn parties(&self) -> Vec<Pubkey> {
        vec![
            self.opener.pubkey(),
            self.party1.pubkey(),
            self.party2.pubkey(),
        ]
    }
}

/// Real `open_case` (the dependency) against the fabricated Subaccord.
fn open_case(env: &mut TestEnv) {
    let ix = env
        .ctx
        .program()
        .accounts(accounts::OpenCase {
            opener: env.opener.pubkey(),
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
        .execute_instruction(ix, &[&env.opener])
        .unwrap()
        .assert_success();
}

fn setup_env() -> TestEnv {
    let mut ctx = setup();
    let opener = Keypair::new();
    ctx.svm
        .airdrop(&opener.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
    let subaccord = Pubkey::new_unique();
    fabricate_subaccord(&mut ctx, &subaccord, mint);
    let case = case_pda(&opener.pubkey(), 0);
    let mut env = TestEnv {
        ctx,
        opener,
        party1: Keypair::new(),
        party2: Keypair::new(),
        case,
        subaccord,
        mint,
    };
    open_case(&mut env);
    env
}

/// Fund a party: SOL + `balance`-funded `fee_token` ATA.
fn arm_party(env: &mut TestEnv, party: &Keypair, balance: u64) {
    // Fresh blockhash: repeated identical airdrops/txs otherwise replay as
    // AlreadyProcessed (canon's double-init test hits the same, hence its
    // expire_blockhash call).
    env.ctx.svm.expire_blockhash();
    env.ctx
        .svm
        .airdrop(&party.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let ata = party_ata(&party.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &ata, &env.mint, &party.pubkey(), balance);
}
fn do_join(
    env: &mut TestEnv,
    party: &Keypair,
    evidence: [u8; 32],
) -> anchor_litesvm::TransactionResult {
    env.ctx.svm.expire_blockhash();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Join {
            party: party.pubkey(),
            case: env.case,
            subaccord: env.subaccord,
            fee_mint: env.mint,
            party_token_account: party_ata(&party.pubkey(), &env.mint),
            vault: vault_ata(&env.case, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::Join {
            evidence_hash: evidence,
        })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[party]).unwrap()
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

/// Overwrite the on-chain `SynodCase` (state/deadline gates).
fn set_case(env: &mut TestEnv, case: SynodCase) {
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
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// Happy path: every party joins — bitmask fills, evidence lands per-slot,
/// vault holds N·S.
#[test]
fn join_happy_all_parties_stake_and_record_evidence() {
    let mut env = setup_env();

    let opener = env.opener.insecure_clone();
    let party1 = env.party1.insecure_clone();
    let party2 = env.party2.insecure_clone();
    arm_party(&mut env, &opener, STAKE);
    arm_party(&mut env, &party1, STAKE);
    arm_party(&mut env, &party2, STAKE);
    do_join(&mut env, &opener, [0xAA; 32]).assert_success();
    do_join(&mut env, &party1, [0xBB; 32]).assert_success();
    do_join(&mut env, &party2, [0xCC; 32]).assert_success();

    let case = read_case(&env);
    assert_eq!(case.joined, 0b111, "all three joined");
    assert_eq!(case.evidence[0], [0xAA; 32]);
    assert_eq!(case.evidence[1], [0xBB; 32]);
    assert_eq!(case.evidence[2], [0xCC; 32]);
    assert_eq!(vault_balance(&env), 3 * STAKE, "vault == N·S");
}

/// A wallet not on the roster cannot join.
#[test]
fn join_reverts_for_non_named_wallet() {
    let mut env = setup_env();
    let stranger = Keypair::new();
    arm_party(&mut env, &stranger, STAKE);
    let r = do_join(&mut env, &stranger, [0xDD; 32]);
    assert_code(&r, "NotNamedParty");
}

/// Double join by the same party is rejected.
#[test]
fn join_reverts_on_double_join() {
    let mut env = setup_env();
    let party1 = env.party1.insecure_clone();
    arm_party(&mut env, &party1, 2 * STAKE);
    do_join(&mut env, &party1, [0xEE; 32]).assert_success();
    let r = do_join(&mut env, &party1, [0xEF; 32]);
    assert_code(&r, "AlreadyJoined");
    assert_eq!(read_case(&env).joined, 0b010, "bit not re-set");
}

/// Join at/after `join_deadline` is rejected (strict `now < deadline`).
#[test]
fn join_reverts_after_deadline() {
    let mut env = setup_env();
    let mut case = read_case(&env);
    case.join_deadline = now(&env.ctx); // boundary: now == deadline -> rejected
    set_case(&mut env, case);

    let party1 = env.party1.insecure_clone();
    arm_party(&mut env, &party1, STAKE);
    let r = do_join(&mut env, &party1, [0x11; 32]);
    assert_code(&r, "JoinDeadlinePassed");
}

/// Join after the case left `Opening` is rejected.
#[test]
fn join_reverts_when_not_opening() {
    let mut env = setup_env();
    let mut case = read_case(&env);
    case.state = CaseState::Live;
    set_case(&mut env, case);

    let party1 = env.party1.insecure_clone();
    arm_party(&mut env, &party1, STAKE);
    let r = do_join(&mut env, &party1, [0x22; 32]);
    assert_code(&r, "NotOpening");
}
