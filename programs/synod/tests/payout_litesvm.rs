#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `refund_roster_miss` + `claim` (SPEC §Instructions #4-5)
//! — the payout paths. Payouts are pull-only and per-party: the caller passes
//! the destination party ATA, which identifies the party (owner ==
//! `parties[i]`); a missing party ATA therefore cannot block another party's
//! claim. Idempotency via `paid_out` bits; the case closes when no payout
//! remains due (winner: one-shot; neutral/failed/refund: all joined bits).
//!
//! The Accord `Dispute` is fabricated directly in the SVM (state + ruling) —
//! claim only reads it, no CPI.
//!
//! Coverage (bean matrix):
//!   - refund happy: joined parties get S back, vault drains, case Closes
//!   - refund replay: second call for the same party is a no-op
//!   - refund reverts: before deadline / full roster / not Opening / unjoined
//!   - claim Final winner: pot = N·S − fee, one-shot, replay no-op,
//!     non-winner no-op, case Closes
//!   - claim Final neutral: per-party (N·S − fee)/N floor; remainder to the
//!     last claimant; sum(leaves) == vault (drained exactly)
//!   - claim Failed: each party S in full
//!   - claim reverts: dispute not Final / invalid ruling

use accord::state::{Aggregation, CaseTerms, Dispute, DisputeState, ShortfallPolicy, Subaccord};
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
use synod::constants::*;
use synod::state::{CaseState, SynodCase};
use synod::{accounts, instruction, ID as SYNOD_ID};

const SPL_RENT: u64 = 1_000_000_000;
const STAKE: u64 = 1_000;
const FEE_PER_JUROR: u64 = 11; // 3 jurors -> fee 33 (odd vs N=2: remainder path)
const MIN_JURY_SIZE: u32 = 3;
const FEE: u64 = MIN_JURY_SIZE as u64 * FEE_PER_JUROR;

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
    mint: Pubkey,
}

/// synod deployed (no accord program needed — no CPI; the Dispute account is
/// fabricated accord-owned), Subaccord + mints + a real open_case.
fn setup_env(party_count: usize, join_count: usize) -> TestEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(SYNOD_ID, &load_so("synod"));
    let opener = Keypair::new();
    ctx.svm
        .airdrop(&opener.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
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
    open_case(&mut env, party_count);
    join_parties(&mut env, join_count);
    env
}

fn open_case(env: &mut TestEnv, party_count: usize) {
    let opener = env.opener.insecure_clone();
    let mut parties = vec![opener.pubkey(), env.party1.pubkey(), env.party2.pubkey()];
    parties.truncate(party_count);
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
            parties,
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
}

fn join_parties(env: &mut TestEnv, count: usize) {
    let roster = [
        env.opener.insecure_clone(),
        env.party1.insecure_clone(),
        env.party2.insecure_clone(),
    ];
    for kp in roster.iter().take(count) {
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

fn read_case(env: &TestEnv) -> SynodCase {
    let acc = env.ctx.svm.get_account(&env.case).expect("case exists");
    SynodCase::try_deserialize(&mut &acc.data[..]).unwrap()
}

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

fn vault_balance(env: &TestEnv) -> u64 {
    let vata = vault_ata(&env.case, &env.mint);
    let acc = env.ctx.svm.get_account(&vata).expect("vault exists");
    SplTokenAccount::unpack(&acc.data).unwrap().amount
}

fn ata_balance(env: &TestEnv, party: &Pubkey) -> u64 {
    let ata = party_ata(party, &env.mint);
    match env.ctx.svm.get_account(&ata) {
        Some(acc) => SplTokenAccount::unpack(&acc.data).unwrap().amount,
        None => 0,
    }
}

/// Fabricate the accord-owned `Dispute` at `["dispute", case, 0]`, bind it on
/// the case (`dispute` field + state Live, as `file_dispute` would have).
fn bind_dispute(env: &mut TestEnv, state: DisputeState, ruling: u64) {
    let dispute_addr = accord::dispute_pda(&env.case, 0).0;
    let d = Dispute {
        subaccord: env.subaccord,
        filer: env.case,
        nonce: 0,
        num_options: read_case(env).party_count + 1,
        options: [[0u8; 32]; 8],
        evidence_hashes: [[0u8; 32]; accord::constants::NUM_EVIDENCE_SLOTS],
        state,
        current_round: 0,
        terms: CaseTerms {
            alpha_bps: 1_000,
            min_stake: 1_000,
            fee_per_juror: FEE_PER_JUROR,
            review_window: 7 * 24 * 3600,
            commit_window: 2 * 24 * 3600,
            reveal_window: 2 * 24 * 3600,
            appeal_window: 3 * 24 * 3600,
            max_appeals: 3,
            min_jury_size: MIN_JURY_SIZE,
            aggregation: Aggregation::Plurality,
            reveal_threshold_bps: 6_666,
            shortfall_policy: ShortfallPolicy::Redraw,
            max_draw_attempts: 3,
            coherence_tol_bps: 0,
        },
        final_ruling: ruling,
        finalized_at: if state == DisputeState::Final { 1 } else { 0 },
        fee_paid: FEE,
        committed_vrf: None,
        frozen_root: [0u8; 32],
        frozen_total_stake: 0,
        filed_at: 0,
        bump: 254,
    };
    let mut buf = Vec::new();
    d.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            dispute_addr,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL.max(SPL_RENT),
                data: buf,
                owner: ACCORD_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

    let mut case = read_case(env);
    case.dispute = dispute_addr;
    case.state = CaseState::Live;
    set_case(env, case);
}

/// Simulate the vault state after `file_dispute` (fee consumed): N·S − fee.
/// For Failed-path tests the fee is returned (vault back to N·S).
fn consume_fee(env: &mut TestEnv, party_count: usize, returned: bool) {
    let vata = vault_ata(&env.case, &env.mint);
    let amount = if returned {
        party_count as u64 * STAKE
    } else {
        party_count as u64 * STAKE - FEE
    };
    create_token_account(&mut env.ctx, &vata, &env.mint, &env.case, amount);
}

fn do_refund(
    env: &mut TestEnv,
    caller: &Keypair,
    party: &Keypair,
) -> anchor_litesvm::TransactionResult {
    env.ctx.svm.expire_blockhash();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::RefundRosterMiss {
            caller: caller.pubkey(),
            case: env.case,
            opener: env.opener.pubkey(),
            subaccord: env.subaccord,
            fee_mint: env.mint,
            party_token_account: party_ata(&party.pubkey(), &env.mint),
            vault: vault_ata(&env.case, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::RefundRosterMiss { nonce: 0 })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn do_claim(
    env: &mut TestEnv,
    caller: &Keypair,
    party: &Keypair,
) -> anchor_litesvm::TransactionResult {
    env.ctx.svm.expire_blockhash();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Claim {
            caller: caller.pubkey(),
            case: env.case,
            opener: env.opener.pubkey(),
            dispute: accord::dispute_pda(&env.case, 0).0,
            subaccord: env.subaccord,
            fee_mint: env.mint,
            party_token_account: party_ata(&party.pubkey(), &env.mint),
            vault: vault_ata(&env.case, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::Claim { nonce: 0 })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

/// Pass the join deadline (incomplete roster only — full rosters never hit it).
fn pass_deadline(env: &mut TestEnv) {
    let mut case = read_case(env);
    case.join_deadline = now(&env.ctx) - 1;
    set_case(env, case);
}

// ─── refund_roster_miss ──────────────────────────────────────────────────────

/// Happy: 2 of 3 joined, deadline passed -> each joined party pulls S back,
/// vault drains to 0, case Closes. Replay for the same party is a no-op.
#[test]
fn refund_happy_refunds_joined_and_closes() {
    // party2 never joined (real miss: vault holds exactly 2·S).
    let mut env = setup_env(3, 2);
    let opener = env.opener.insecure_clone();
    let party1 = env.party1.insecure_clone();
    pass_deadline(&mut env);

    let caller = Keypair::new();
    do_refund(&mut env, &caller, &opener).assert_success();
    assert_eq!(ata_balance(&env, &env.opener.pubkey()), STAKE, "S back");
    assert_eq!(vault_balance(&env), STAKE, "one party's S remains");

    // Replay for the same party: no-op (bit already set), no double pay.
    do_refund(&mut env, &caller, &opener).assert_success();
    assert_eq!(ata_balance(&env, &env.opener.pubkey()), STAKE);

    do_refund(&mut env, &caller, &party1).assert_success();
    assert_eq!(vault_balance(&env), 0, "vault drained");
    assert_eq!(read_case(&env).state, CaseState::Closed);
    assert_eq!(read_case(&env).paid_out, 0b011);
}

#[test]
fn refund_reverts_before_deadline() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    let mut case = read_case(&env);
    case.joined = 0b01; // incomplete
    set_case(&mut env, case);
    let caller = Keypair::new();
    let r = do_refund(&mut env, &caller, &opener);
    assert_code(&r, "JoinDeadlineNotReached");
}

#[test]
fn refund_reverts_on_full_roster() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    pass_deadline(&mut env);
    let caller = Keypair::new();
    let r = do_refund(&mut env, &caller, &opener);
    assert_code(&r, "RosterComplete");
}

#[test]
fn refund_reverts_when_not_opening() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    let mut case = read_case(&env);
    case.joined = 0b01;
    case.state = CaseState::Live;
    set_case(&mut env, case);
    let caller = Keypair::new();
    let r = do_refund(&mut env, &caller, &opener);
    assert_code(&r, "NotOpening");
}

/// The destination ATA belongs to a party that never joined -> nothing to
/// refund.
#[test]
fn refund_reverts_for_unjoined_party() {
    let mut env = setup_env(3, 3);
    let party2 = env.party2.insecure_clone();
    let mut case = read_case(&env);
    case.joined = 0b011; // party2 never joined
    set_case(&mut env, case);
    pass_deadline(&mut env);
    let caller = Keypair::new();
    let r = do_refund(&mut env, &caller, &party2);
    assert_code(&r, "PartyNotJoined");
}

// ─── claim ───────────────────────────────────────────────────────────────────

/// Final winner (ruling 1 of 3): party 1 pulls the pot 3·S − fee, one-shot;
/// replay no-op; non-winner no-op; case Closes on the winner payout.
#[test]
fn claim_winner_pot_one_shot() {
    let mut env = setup_env(3, 3);
    let party1 = env.party1.insecure_clone();
    let party2 = env.party2.insecure_clone();
    bind_dispute(&mut env, DisputeState::Final, 1);
    consume_fee(&mut env, 3, false);

    let caller = Keypair::new();
    // Non-winner first: no-op, no state change.
    do_claim(&mut env, &caller, &party2).assert_success();
    assert_eq!(vault_balance(&env), 3 * STAKE - FEE);

    do_claim(&mut env, &caller, &party1).assert_success();
    assert_eq!(ata_balance(&env, &env.party1.pubkey()), 3 * STAKE - FEE);
    assert_eq!(vault_balance(&env), 0, "pot drained");
    assert_eq!(read_case(&env).state, CaseState::Closed, "one-shot close");
    assert_eq!(read_case(&env).paid_out, 0b010, "winner bit only");

    // Replay after close: nothing due for anyone.
    do_claim(&mut env, &caller, &party1).assert_success();
    assert_eq!(vault_balance(&env), 0);
}

/// Final neutral with a remainder (2 parties, fee 33): per-party floor
/// (2·S − 33)/2 = 983, last claimant takes 984; vault drains exactly.
#[test]
fn claim_neutral_splits_with_remainder_to_last() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    let party1 = env.party1.insecure_clone();
    bind_dispute(&mut env, DisputeState::Final, 2); // == party_count -> neutral
    consume_fee(&mut env, 2, false);

    let caller = Keypair::new();
    do_claim(&mut env, &caller, &opener).assert_success();
    assert_eq!(ata_balance(&env, &env.opener.pubkey()), 983);
    // Invariant mid-flow: vault >= outstanding claims (984).
    assert_eq!(vault_balance(&env), 984);

    do_claim(&mut env, &caller, &party1).assert_success();
    assert_eq!(
        ata_balance(&env, &env.party1.pubkey()),
        984,
        "remainder to last"
    );
    assert_eq!(vault_balance(&env), 0, "sum(leaves) == vault");
    assert_eq!(read_case(&env).state, CaseState::Closed);
    assert_eq!(read_case(&env).paid_out, 0b11);
}

/// Failed (cancel_dispute returned the fee): each party pulls S in full.
#[test]
fn claim_failed_full_refund() {
    let mut env = setup_env(3, 3);
    let opener = env.opener.insecure_clone();
    let party1 = env.party1.insecure_clone();
    let party2 = env.party2.insecure_clone();
    bind_dispute(&mut env, DisputeState::Failed, u64::MAX);
    consume_fee(&mut env, 3, true); // fee returned by cancel_dispute

    let caller = Keypair::new();
    do_claim(&mut env, &caller, &opener).assert_success();
    do_claim(&mut env, &caller, &party1).assert_success();
    assert_eq!(
        read_case(&env).state,
        CaseState::Live,
        "still one outstanding"
    );
    do_claim(&mut env, &caller, &party2).assert_success();
    assert_eq!(ata_balance(&env, &env.party2.pubkey()), STAKE);
    assert_eq!(vault_balance(&env), 0);
    assert_eq!(read_case(&env).state, CaseState::Closed);
}

/// Dispute still resolving (tie rounds redraw, etc.) -> claim only reads
/// Final/Failed.
#[test]
fn claim_reverts_before_final() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    bind_dispute(&mut env, DisputeState::Reveal, u64::MAX);
    consume_fee(&mut env, 2, false);
    let caller = Keypair::new();
    let r = do_claim(&mut env, &caller, &opener);
    assert_code(&r, "DisputeNotFinal");
}

/// Ruling beyond the option set (corrupted/governance-changed) -> rejected.
#[test]
fn claim_reverts_on_invalid_ruling() {
    let mut env = setup_env(2, 2);
    let opener = env.opener.insecure_clone();
    bind_dispute(&mut env, DisputeState::Final, 99);
    consume_fee(&mut env, 2, false);
    let caller = Keypair::new();
    let r = do_claim(&mut env, &caller, &opener);
    assert_code(&r, "InvalidRuling");
}
