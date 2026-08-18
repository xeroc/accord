#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `open_case` (SPEC §Instructions #1).
//!
//! Coverage (TDD acceptance matrix from the bean + milestone §6):
//!   - happy: SynodCase inits all fields, fee frozen at
//!     `min_jury_size · fee_per_juror`, state Opening, parties padded
//!   - args: 8 parties (and 1 party) -> InvalidPartyCount
//!   - args: duplicate party -> DuplicateParty
//!   - args: opener != parties[0] -> OpenerNotFirstParty
//!   - args: Median subaccord -> AggregationNotPlurality
//!   - args: party_count · stake <= fee -> PotNotPositive
//!   - args: join_deadline <= now -> JoinDeadlinePassed
//!   - reinit: double open on the same (opener, nonce) -> PDA collision
//!
//! The Accord `Subaccord` is fabricated directly in the SVM (discriminator +
//! fields, owner = accord program), mirroring the canon litesvm pattern for
//! parent accounts. One fresh context per test.

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
use std::path::PathBuf;
use synod::state::{CaseState, SynodCase};
use synod::{accounts, constants::*, instruction, ID as SYNOD_ID};

const SPL_RENT: u64 = 1_000_000_000;

/// Canonical-ish subaccord profile (canon defaults): round-1 panel 3,
/// 10 / juror -> frozen fee 30.
const FEE_PER_JUROR: u64 = 10;
const MIN_JURY_SIZE: u32 = 3;

fn load_so(name: &str) -> Vec<u8> {
    let so =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../target/deploy/{name}.so"));
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
}

/// Fresh SVM with synod deployed + a funded opener keypair. (accord is not
/// deployed: `open_case` reads the fabricated Subaccord but never CPIs.)
fn setup() -> (anchor_litesvm::AnchorContext, Keypair) {
    let mut ctx = AnchorLiteSVM::build_with_program(SYNOD_ID, &load_so("synod"));
    let opener = Keypair::new();
    ctx.svm
        .airdrop(&opener.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    (ctx, opener)
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

/// Fabricate an accord-owned `Subaccord` at `addr` (all ledger fields zeroed —
/// `open_case` reads only `aggregation`, `min_jury_size`, `fee_per_juror`).
fn fabricate_subaccord(
    ctx: &mut anchor_litesvm::AnchorContext,
    addr: &Pubkey,
    aggregation: Aggregation,
    min_jury_size: u32,
    fee_per_juror: u64,
) {
    let sub = Subaccord {
        creator: Pubkey::default(),
        staking_token: Pubkey::new_unique(),
        fee_token: Pubkey::new_unique(),
        min_stake: 0,
        alpha_bps: 0,
        review_window: 0,
        commit_window: 0,
        reveal_window: 0,
        appeal_window: 0,
        max_appeals: 0,
        min_jury_size,
        aggregation,
        fee_per_juror,
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

fn read_case(ctx: &anchor_litesvm::AnchorContext, pda: &Pubkey) -> SynodCase {
    let acc = ctx.svm.get_account(pda).expect("SynodCase PDA exists");
    SynodCase::try_deserialize(&mut &acc.data[..]).unwrap()
}

/// Distinct party pubkeys, `parties[0] == opener`.
fn roster(opener: &Pubkey, n: usize) -> Vec<Pubkey> {
    let mut v = vec![*opener];
    for i in 1..n {
        let mut a = [0u8; 32];
        a[..8].copy_from_slice(&(i as u64).to_le_bytes());
        v.push(Pubkey::new_from_array(a));
    }
    v
}

/// Assert the tx failed with the named anchor error code.
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

struct OpenArgs {
    aggregation: Aggregation,
    min_jury_size: u32,
    fee_per_juror: u64,
    parties: Vec<Pubkey>,
    stake: u64,
    deadline: i64,
    nonce: u64,
}

impl Default for OpenArgs {
    fn default() -> Self {
        OpenArgs {
            aggregation: Aggregation::Plurality,
            min_jury_size: MIN_JURY_SIZE,
            fee_per_juror: FEE_PER_JUROR,
            parties: vec![], // filled by do_open
            stake: 1_000,
            deadline: i64::MAX, // filled by do_open
            nonce: 0,
        }
    }
}

/// Fabricate the subaccord + build + send `open_case`. `parties`/`deadline`
/// default to a valid 3-party roster and now+3600.
fn do_open(
    ctx: &mut anchor_litesvm::AnchorContext,
    opener: &Keypair,
    mut a: OpenArgs,
) -> anchor_litesvm::TransactionResult {
    if a.parties.is_empty() {
        a.parties = roster(&opener.pubkey(), 3);
    }
    if a.deadline == i64::MAX {
        a.deadline = now(ctx) + 3600;
    }
    let subaccord = Pubkey::new_unique();
    fabricate_subaccord(
        ctx,
        &subaccord,
        a.aggregation,
        a.min_jury_size,
        a.fee_per_juror,
    );
    let ix = ctx
        .program()
        .accounts(accounts::OpenCase {
            opener: opener.pubkey(),
            subaccord,
            case: case_pda(&opener.pubkey(), a.nonce),
            system_program: system_program::ID,
        })
        .args(instruction::OpenCase {
            parties: a.parties,
            stake: a.stake,
            join_deadline: a.deadline,
            nonce: a.nonce,
        })
        .instruction()
        .expect("build open_case instruction");
    ctx.execute_instruction(ix, &[opener]).unwrap()
}

/// Happy path: all fields init, fee frozen at `min_jury_size · fee_per_juror`,
/// state Opening, parties padded with `Pubkey::default()`.
#[test]
fn open_case_happy_inits_case_and_freezes_fee() {
    let (mut ctx, opener) = setup();
    let parties = roster(&opener.pubkey(), 3);
    let deadline = now(&ctx) + 3600;

    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            deadline,
            ..Default::default()
        },
    );
    r.assert_success();

    let case = read_case(&ctx, &case_pda(&opener.pubkey(), 0));
    assert_eq!(case.party_count, 3);
    assert_eq!(case.parties[..3], parties[..]);
    assert_eq!(case.parties[3], Pubkey::default(), "tail padded");
    assert_eq!(case.joined, 0, "nobody joined yet");
    assert_eq!(case.stake, 1_000);
    // Fee FROZEN at open: 3 jurors x 10 = 30 — never re-read from the Subaccord.
    assert_eq!(case.fee, MIN_JURY_SIZE as u64 * FEE_PER_JUROR);
    assert_eq!(case.join_deadline, deadline);
    assert_eq!(case.evidence, [[0u8; 32]; MAX_PARTIES]);
    assert_eq!(case.dispute, Pubkey::default(), "sentinel until filed");
    assert_eq!(case.paid_out, 0);
    assert_eq!(case.state, CaseState::Opening);
    assert!(case.bump > 0);
}

/// 8 parties (MAX_PARTIES + 1) and 1 party both fail InvalidPartyCount.
#[test]
fn open_case_rejects_out_of_bounds_party_count() {
    let (mut ctx, opener) = setup();
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            parties: roster(&opener.pubkey(), MAX_PARTIES + 1),
            ..Default::default()
        },
    );
    assert_code(&r, "InvalidPartyCount");

    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            parties: roster(&opener.pubkey(), 1),
            ..Default::default()
        },
    );
    assert_code(&r, "InvalidPartyCount");
}

#[test]
fn open_case_rejects_duplicate_party() {
    let (mut ctx, opener) = setup();
    let mut parties = roster(&opener.pubkey(), 3);
    parties[2] = parties[1]; // duplicate
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            parties,
            ..Default::default()
        },
    );
    assert_code(&r, "DuplicateParty");
}

#[test]
fn open_case_rejects_opener_not_first_party() {
    let (mut ctx, opener) = setup();
    let mut parties = roster(&opener.pubkey(), 3);
    parties.swap(0, 1); // opener no longer at index 0
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            parties,
            ..Default::default()
        },
    );
    assert_code(&r, "OpenerNotFirstParty");
}

#[test]
fn open_case_rejects_median_aggregation() {
    let (mut ctx, opener) = setup();
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            aggregation: Aggregation::Median,
            ..Default::default()
        },
    );
    assert_code(&r, "AggregationNotPlurality");
}

/// `party_count · stake <= fee` fails PotNotPositive (strict >, both edges).
#[test]
fn open_case_rejects_non_positive_pot() {
    let (mut ctx, opener) = setup();
    // 3 parties x 10 stake = 30 == fee 30 -> not positive.
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            stake: FEE_PER_JUROR,
            ..Default::default()
        },
    );
    assert_code(&r, "PotNotPositive");

    // 3 x 9 = 27 < 30 -> also rejected.
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            stake: FEE_PER_JUROR - 1,
            ..Default::default()
        },
    );
    assert_code(&r, "PotNotPositive");
}

#[test]
fn open_case_rejects_deadline_not_in_future() {
    let (mut ctx, opener) = setup();
    let now = now(&ctx);
    let r = do_open(
        &mut ctx,
        &opener,
        OpenArgs {
            deadline: now,
            ..Default::default()
        },
    );
    assert_code(&r, "JoinDeadlinePassed");
}

/// Double open on the same (opener, nonce) collides on the case PDA.
#[test]
fn open_case_double_init_fails() {
    let (mut ctx, opener) = setup();
    let r = do_open(&mut ctx, &opener, OpenArgs::default());
    r.assert_success();
    ctx.svm.expire_blockhash();

    let r = do_open(&mut ctx, &opener, OpenArgs::default());
    assert!(
        !r.is_success(),
        "double open_case must fail; logs={:?}",
        r.logs()
    );
}
