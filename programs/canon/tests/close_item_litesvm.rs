#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `close_item` (bean accord-m0a1 — RED suite; greened by
//! accord-kmz6).
//!
//! RED NOTE: this file references `accounts::CloseItem`,
//! `instruction::CloseItem`, and `canon::events::ItemClosed`, none of which
//! exist yet — the compile failure against the current program IS the RED
//! state. The GREEN task adds the instruction with exactly these symbols.
//!
//! Coverage (TDD acceptance matrix, milestone accord-clfq HANDOFF §2/§4/§6):
//!   - happy: Removed item closed → account wiped, full rent → caller,
//!     `ItemClosed { list, item, account, submitter }` emitted
//!   - revert NotRemoved: Pending / Listed / WithdrawPending / Disputed
//!     (live items hold their deposit, so a passing NotRemoved assert also
//!     pins the state guard ahead of the accumulated_stake guard)
//!   - defensive revert: Removed with outstanding accumulated_stake
//!   - defensive revert: Removed with a live active_dispute
//!
//! `close_item` touches only the item account (self-seeded
//! `["canon-item", item.list, item.account]`), so the harness fixture-writes
//! `CanonItem`s directly — no mint/vault/submit plumbing needed here.

use anchor_lang::{AccountDeserialize, AccountSerialize};
use anchor_litesvm::{AnchorLiteSVM, EventHelpers};
use canon::events::ItemClosed;
use canon::state::{CanonItem, ItemState};
use canon::{accounts, constants::*, instruction, ID as CANON_ID};
use solana_program::pubkey::Pubkey;
use solana_sdk::account::Account as SvmAccount;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::path::PathBuf;

/// Fixture rent held by the item PDA. Any value works (close drains whatever
/// is there); realistic-ish rent-exempt order of magnitude.
const ITEM_LAMPORTS: u64 = 1_500_000;
/// LiteSVM charges the base fee (5_000 lamports × 1 signature — the caller is
/// the sole signer and payer, no priority fee) from the caller, so the happy
/// path's SOL delta is rent minus this.
const TX_FEE: u64 = 5_000;
const RULES_HASH: [u8; 32] = {
    let mut h = [0u8; 32];
    h[0] = 0xAB;
    h
};

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/canon.so");
    std::fs::read(&so).unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` first"))
}

fn list_pda(c: &Pubkey, rh: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_CANON_LIST, c.as_ref(), rh], &CANON_ID)
}

fn item_pda(l: &Pubkey, a: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_CANON_ITEM, l.as_ref(), a.as_ref()], &CANON_ID).0
}

struct TestEnv {
    ctx: anchor_litesvm::AnchorContext,
    list: Pubkey,
}

fn setup() -> TestEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(CANON_ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let (list, _bump) = list_pda(&creator.pubkey(), &RULES_HASH);
    TestEnv { ctx, list }
}

/// Fixture a `CanonItem` at its canonical PDA (`["canon-item", list, account]`,
/// real derived bump stored on the account), owned by Canon, holding
/// `lamports`. Returns `(curated account, item PDA)`.
///
/// Mirrors the real state machine: a live item holds its deposit; a `Removed`
/// item has zeroed terminal bookkeeping (what `advance_withdrawal` /
/// `settle_item` leave behind).
fn fixture_item(env: &mut TestEnv, state: ItemState, lamports: u64) -> (Pubkey, Pubkey) {
    let curated = Pubkey::new_unique();
    let (pda, bump) = Pubkey::find_program_address(
        &[SEED_CANON_ITEM, env.list.as_ref(), curated.as_ref()],
        &CANON_ID,
    );
    let item = CanonItem {
        account: curated,
        list: env.list,
        submitter: Pubkey::new_unique(),
        state,
        accumulated_stake: if state == ItemState::Removed {
            0
        } else {
            DEFAULT_SUBMIT_DEPOSIT
        },
        submitted_at: 1,
        challenge_count: 0,
        active_dispute: Pubkey::default(),
        challenger: Pubkey::default(),
        challenge_stake: 0,
        challenged_at: 0,
        withdrawal_requested_at: None,
        bump,
    };
    let mut buf = Vec::new();
    item.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            pda,
            SvmAccount {
                lamports,
                data: buf,
                owner: CANON_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    (curated, pda)
}

/// Rewrite the item account (preserving lamports) after fixture-time mutation.
fn mutate_item(env: &mut TestEnv, curated: &Pubkey, f: impl FnOnce(&mut CanonItem)) {
    let pda = item_pda(&env.list, curated);
    let mut item = read_item(env, curated);
    f(&mut item);
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
                owner: CANON_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

fn read_item(env: &TestEnv, curated: &Pubkey) -> CanonItem {
    let pda = item_pda(&env.list, curated);
    let acc = env.ctx.svm.get_account(&pda).expect("item exists");
    CanonItem::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn fund_caller(env: &mut TestEnv) -> Keypair {
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    caller
}

fn do_close(
    env: &mut TestEnv,
    caller: &Keypair,
    item: &Pubkey,
) -> anchor_litesvm::TransactionResult {
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CloseItem {
            caller: caller.pubkey(),
            item: *item,
        })
        .args(instruction::CloseItem {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[test]
fn close_removed_drains_rent_to_caller_and_wipes_account() {
    let mut env = setup();
    let (curated, item) = fixture_item(&mut env, ItemState::Removed, ITEM_LAMPORTS);
    let submitter = read_item(&env, &curated).submitter;
    let caller = fund_caller(&mut env);
    let caller_before = env.ctx.svm.get_account(&caller.pubkey()).unwrap().lamports;

    let r = do_close(&mut env, &caller, &item);
    r.assert_success();

    // ItemClosed { list, item, account, submitter } — exact fields.
    let ev = r.parse_event::<ItemClosed>().unwrap();
    assert_eq!(ev.list, env.list, "event.list");
    assert_eq!(ev.item, item, "event.item");
    assert_eq!(ev.account, curated, "event.account");
    assert_eq!(ev.submitter, submitter, "event.submitter");

    // Account zeroed / no longer deserialises (LiteSVM may or may not GC it).
    match env.ctx.svm.get_account(&item) {
        None => {}
        Some(acc) => {
            assert_eq!(acc.lamports, 0, "rent fully drained");
            assert!(
                CanonItem::try_deserialize(&mut &acc.data[..]).is_err(),
                "data wiped"
            );
        }
    }

    // Full pre-close lamports land in the caller's pocket, minus the tx fee.
    let caller_after = env.ctx.svm.get_account(&caller.pubkey()).unwrap().lamports;
    assert_eq!(
        caller_after - caller_before,
        ITEM_LAMPORTS - TX_FEE,
        "rent → caller (minus base fee); logs={:?}",
        r.logs()
    );
}

// ─── NotRemoved: every live state reverts ────────────────────────────────────

fn assert_reverts_not_removed(state: ItemState) {
    let mut env = setup();
    let (curated, item) = fixture_item(&mut env, state, ITEM_LAMPORTS);
    if state == ItemState::Disputed {
        // Realistic Disputed bookkeeping — closing mid-dispute would strand
        // the challenger's bounty path.
        mutate_item(&mut env, &curated, |it| {
            it.active_dispute = Pubkey::new_unique();
            it.challenger = Pubkey::new_unique();
            it.challenge_stake = 1;
        });
    }
    let caller = fund_caller(&mut env);
    let r = do_close(&mut env, &caller, &item);
    assert!(
        !r.is_success(),
        "close on {state:?} must revert; logs={:?}",
        r.logs()
    );
    // Live items hold their deposit, so this also pins the state guard firing
    // ahead of the accumulated_stake guard (HANDOFF §4 pseudo ordering).
    let logs = r.logs().join("\n");
    assert!(
        logs.contains("NotRemoved"),
        "state guard must report NotRemoved; logs={logs:?}"
    );
    // Account untouched.
    assert_eq!(read_item(&env, &curated).state, state, "state unchanged");
}

#[test]
fn close_reverts_on_pending() {
    assert_reverts_not_removed(ItemState::Pending);
}

#[test]
fn close_reverts_on_listed() {
    assert_reverts_not_removed(ItemState::Listed);
}

#[test]
fn close_reverts_on_withdraw_pending() {
    assert_reverts_not_removed(ItemState::WithdrawPending);
}

#[test]
fn close_reverts_on_disputed() {
    assert_reverts_not_removed(ItemState::Disputed);
}

// ─── defensive guards: Removed with breached invariants ──────────────────────

/// `Removed` + outstanding stake is a state-machine bug: fail loudly, never
/// strand tokens. (HANDOFF §4 pseudo names `StakeOutstanding`; the variant
/// choice is the GREEN task's — here we only pin revert + account intact.)
#[test]
fn close_reverts_on_removed_with_outstanding_stake() {
    let mut env = setup();
    let (curated, item) = fixture_item(&mut env, ItemState::Removed, ITEM_LAMPORTS);
    mutate_item(&mut env, &curated, |it| it.accumulated_stake = 42);
    let caller = fund_caller(&mut env);
    let r = do_close(&mut env, &caller, &item);
    assert!(
        !r.is_success(),
        "close with outstanding stake must revert; logs={:?}",
        r.logs()
    );
    let after = read_item(&env, &curated);
    assert_eq!(after.state, ItemState::Removed, "account intact");
    assert_eq!(after.accumulated_stake, 42);
}

#[test]
fn close_reverts_on_removed_with_active_dispute() {
    let mut env = setup();
    let (curated, item) = fixture_item(&mut env, ItemState::Removed, ITEM_LAMPORTS);
    mutate_item(&mut env, &curated, |it| {
        it.active_dispute = Pubkey::new_unique()
    });
    let caller = fund_caller(&mut env);
    let r = do_close(&mut env, &caller, &item);
    assert!(
        !r.is_success(),
        "close with a live active_dispute must revert; logs={:?}",
        r.logs()
    );
    let after = read_item(&env, &curated);
    assert_eq!(after.state, ItemState::Removed, "account intact");
    assert_ne!(after.active_dispute, Pubkey::default());
}
