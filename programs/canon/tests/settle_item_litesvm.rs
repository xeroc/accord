#![cfg(feature = "no-entrypoint")]
//! LiteSVM tests for `settle_item` (bean accord-r90a).
//!
//! Runs under `make test_unit` (Solana 3.1.10 / SBPF v3 — the prior SBPF v0
//! stack-frame limit that forced `#[ignore]` is resolved; the ignores are gone).
//!
//! Coverage (TDD acceptance matrix):
//!   - regular keep: challenge_stake → accumulated_stake, item → Listed
//!   - regular remove: accumulated_stake + challenge_stake → challenger, Removed
//!   - withdrawal-keep: stake → submitter (frivolous-block penalty), Removed
//!   - Failed dispute: submitter refunded, challenger stake returned, Removed
//!   - revert: dispute not Final
//!   - revert: item not Disputed
//!   - revert: remove bounty to a non-challenger destination (C-1)
//!   - revert: withdrawal-keep payout to a non-submitter destination (C-1)
//!   - revert: vault passed as payout destination (C-1 duplicate-account)

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
use accord::ID as ACCORD_ID;

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
fn list_pda(c: &Pubkey, rh: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED_CANON_LIST, c.as_ref(), rh], &CANON_ID)
}
fn item_pda(l: &Pubkey, a: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_CANON_ITEM, l.as_ref(), a.as_ref()], &CANON_ID).0
}
fn vault_ata(l: &Pubkey, m: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(l, m, &TOKEN_PROGRAM_ID)
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

fn setup() -> TestEnv {
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
        listing_window: 0,
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
                owner: CANON_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    create_token_account(
        &mut ctx,
        &vault_ata(&list_addr, &mint),
        &mint,
        &list_addr,
        0,
    );
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

/// Submit + advance to Listed.
fn make_listed(env: &mut TestEnv, submitter: &Keypair) -> Pubkey {
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

/// Force the item into Disputed with the given bookkeeping.
fn set_disputed(
    env: &mut TestEnv,
    curated: &Pubkey,
    challenger: &Pubkey,
    challenge_stake: u64,
    dispute: &Pubkey,
    is_withdrawal: bool,
) {
    let pda = item_pda(&env.list, curated);
    let mut item = read_item(env, curated);
    item.state = ItemState::Disputed;
    item.active_dispute = *dispute;
    item.challenger = *challenger;
    item.challenge_stake = challenge_stake;
    item.challenged_at = 1;
    if is_withdrawal {
        item.withdrawal_requested_at = Some(1);
    }
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
    // Fund the vault with the challenge_stake (simulating what challenge_item does).
    let vata = vault_ata(&env.list, &env.mint);
    let mut ta = SplTokenAccount::unpack(&env.ctx.svm.get_account(&vata).unwrap().data).unwrap();
    ta.amount += challenge_stake;
    let mut buf2 = [0u8; SplTokenAccount::LEN];
    Pack::pack(ta, &mut buf2).unwrap();
    let lamports2 = env.ctx.svm.get_account(&vata).unwrap().lamports;
    env.ctx
        .svm
        .set_account(
            vata,
            SvmAccount {
                lamports: lamports2,
                data: buf2.to_vec(),
                owner: TOKEN_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

/// Fabricate an Accord Dispute account at the given PDA by serialising a real
/// `accord::state::Dispute` (correct discriminator + layout), so `settle_item`'s
/// `Dispute::try_deserialize` succeeds. `state`/`final_ruling` are the only
/// fields `settle_item` reads; the rest are plausible defaults.
fn fabricate_dispute(
    env: &mut TestEnv,
    dispute: &Pubkey,
    state: accord::state::DisputeState,
    ruling: u64,
) {
    let mut options = [[0u8; 32]; accord::constants::MAX_OPTIONS];
    options[0][0] = b'k';
    options[1][0] = b'r';
    let d = accord::state::Dispute {
        subaccord: Pubkey::default(),
        filer: Pubkey::default(),
        nonce: 0,
        num_options: 2,
        options,
        evidence_hashes: [[0u8; 32]; accord::constants::MAX_APPEALS as usize + 1],
        state,
        current_round: 0,
        terms: accord::state::CaseTerms {
            alpha_bps: 1000,
            min_stake: 1_000,
            fee_per_juror: 3,
            review_window: 604_800,
            commit_window: 172_800,
            reveal_window: 172_800,
            appeal_window: 259_200,
            max_appeals: 3,
            min_jury_size: 3,
            aggregation: accord::state::Aggregation::Plurality,
            reveal_threshold_bps: 6_666,
            shortfall_policy: accord::state::ShortfallPolicy::Redraw,
            max_draw_attempts: 3,
            coherence_tol_bps: 0,
        },
        final_ruling: ruling,
        finalized_at: if state == accord::state::DisputeState::Final {
            99
        } else {
            0
        },
        fee_paid: 30,
        committed_vrf: None,
        frozen_root: [0u8; 32],
        frozen_total_stake: 0,
        filed_at: 0,
        bump: 254,
        padding: [0; 64],
    };
    let mut buf = Vec::new();
    d.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            *dispute,
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

fn dispute_pda(filer: &Pubkey, nonce: u64) -> Pubkey {
    accord::dispute_pda(filer, nonce).0
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

fn read_balance(env: &TestEnv, user: &Pubkey) -> u64 {
    let uata = user_ata(user, &env.mint);
    SplTokenAccount::unpack(&env.ctx.svm.get_account(&uata).unwrap().data)
        .unwrap()
        .amount
}

fn do_settle(
    env: &mut TestEnv,
    caller: &Keypair,
    curated: &Pubkey,
    challenger: &Keypair,
    submitter: &Keypair,
) -> anchor_litesvm::TransactionResult {
    let cata = user_ata(&challenger.pubkey(), &env.mint);
    let sata = user_ata(&submitter.pubkey(), &env.mint);
    do_settle_with_dests(env, caller, curated, &cata, &sata)
}

/// `settle_item` with explicit payout destinations — the C-1 auth tests pass
/// attacker-controlled / vault addresses through here.
fn do_settle_with_dests(
    env: &mut TestEnv,
    caller: &Keypair,
    curated: &Pubkey,
    challenger_ta: &Pubkey,
    submitter_ta: &Pubkey,
) -> anchor_litesvm::TransactionResult {
    let item = item_pda(&env.list, curated);
    let dispute = dispute_pda(&env.list, 0);
    let vata = vault_ata(&env.list, &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::SettleItem {
            caller: caller.pubkey(),
            list: env.list,
            item,
            dispute,
            fee_mint: env.mint,
            vault: vata,
            challenger_token_account: *challenger_ta,
            submitter_token_account: *submitter_ta,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::SettleItem {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[test]
fn settle_keep_progressive_protection() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000; // 250
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 0); // keep

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let vault_before = read_vault(&env);
    do_settle(&mut env, &caller, &curated, &challenger, &submitter).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Listed, "keep → Listed");
    assert_eq!(
        item.accumulated_stake,
        env.deposit + challenge_stake,
        "progressive protection"
    );
    assert_eq!(read_vault(&env), vault_before, "no transfer on keep");
}

#[test]
fn settle_remove_bounty_to_challenger() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 1); // remove

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let chall_before = read_balance(&env, &challenger.pubkey());
    do_settle(&mut env, &caller, &curated, &challenger, &submitter).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Removed, "remove → Removed");
    assert_eq!(item.accumulated_stake, 0);
    let expected_bounty = env.deposit + challenge_stake;
    assert_eq!(
        read_balance(&env, &challenger.pubkey()),
        chall_before + expected_bounty,
        "challenger gets bounty"
    );
}

#[test]
fn settle_withdrawal_keep_submitter_gets_stake() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        true,
    ); // withdrawal
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 0); // keep

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let sub_before = read_balance(&env, &submitter.pubkey());
    do_settle(&mut env, &caller, &curated, &challenger, &submitter).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Removed, "withdrawal-keep → Removed");
    let expected = env.deposit + challenge_stake;
    assert_eq!(
        read_balance(&env, &submitter.pubkey()),
        sub_before + expected,
        "submitter gets deposit + penalty"
    );
}

#[test]
fn settle_reverts_if_dispute_not_final() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Created, 0); // NOT final

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let r = do_settle(&mut env, &caller, &curated, &challenger, &submitter);
    assert!(
        !r.is_success(),
        "settle before Final must revert; logs={:?}",
        r.logs()
    );
}

#[test]
fn settle_reverts_if_not_disputed() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter); // Listed, not Disputed
    let dispute = dispute_pda(&env.list, 0);
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 0);

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let r = do_settle(&mut env, &caller, &curated, &challenger, &submitter);
    assert!(
        !r.is_success(),
        "settle on non-Disputed must revert; logs={:?}",
        r.logs()
    );
}

// ─── C-1: payout destinations are constrained (no redirect) ─────────────────

/// The crank caller passes their own ATA as the remove-bounty destination.
#[test]
fn settle_remove_reverts_on_wrong_challenger_destination() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 1); // remove

    let caller = Keypair::new();
    arm_user(&mut env, &caller, 0); // attacker's own fee-mint ATA
    let attacker_ta = user_ata(&caller.pubkey(), &env.mint);
    let submitter_ta = user_ata(&submitter.pubkey(), &env.mint);
    let r = do_settle_with_dests(
        &mut env,
        &caller,
        &curated,
        &attacker_ta, // ← attacker destination
        &submitter_ta,
    );
    assert!(
        !r.is_success(),
        "bounty must only reach item.challenger's account; logs={:?}",
        r.logs()
    );
}

/// The crank caller passes their own ATA as the withdrawal-keep destination.
#[test]
fn settle_withdrawal_keep_reverts_on_wrong_submitter_destination() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        true,
    ); // withdrawal
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 0); // keep

    let caller = Keypair::new();
    arm_user(&mut env, &caller, 0);
    let challenger_ta = user_ata(&challenger.pubkey(), &env.mint);
    let attacker_ta = user_ata(&caller.pubkey(), &env.mint);
    let r = do_settle_with_dests(
        &mut env,
        &caller,
        &curated,
        &challenger_ta,
        &attacker_ta, // ← attacker destination
    );
    assert!(
        !r.is_success(),
        "withdrawal-keep payout must only reach item.submitter's account; logs={:?}",
        r.logs()
    );
}

/// The vault itself as the bounty destination — self-transfer would desync
/// accounting (Removed + accumulated_stake=0 while funds stay in the vault).
#[test]
fn settle_remove_reverts_on_vault_as_destination() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(&mut env, &dispute, accord::state::DisputeState::Final, 1); // remove

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let vault_ta = vault_ata(&env.list, &env.mint);
    let submitter_ta = user_ata(&submitter.pubkey(), &env.mint);
    let r = do_settle_with_dests(
        &mut env,
        &caller,
        &curated,
        &vault_ta, // ← vault as destination
        &submitter_ta,
    );
    assert!(
        !r.is_success(),
        "vault (authority = list PDA) must not be a payout destination; logs={:?}",
        r.logs()
    );
}

// ─── H-1: Failed dispute settlement ──────────────────────────────────────────

/// Terminal `Failed` (cancel / redraw exhaustion): no ruling exists, so both
/// parties are made whole — accumulated_stake → submitter, challenge_stake →
/// challenger (no bounty) — and the item lands in `Removed`.
#[test]
fn settle_failed_dispute_refunds_both_parties() {
    let mut env = setup();
    let submitter = Keypair::new();
    arm_user(&mut env, &submitter, 10_000);
    let curated = make_listed(&mut env, &submitter);
    let challenger = Keypair::new();
    arm_user(&mut env, &challenger, 10_000);
    let dispute = dispute_pda(&env.list, 0);
    let challenge_stake = (DEFAULT_CHALLENGE_PCT_BPS as u64) * env.deposit / 10_000;
    set_disputed(
        &mut env,
        &curated,
        &challenger.pubkey(),
        challenge_stake,
        &dispute,
        false,
    );
    fabricate_dispute(
        &mut env,
        &dispute,
        accord::state::DisputeState::Failed,
        u64::MAX,
    );

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let sub_before = read_balance(&env, &submitter.pubkey());
    let chall_before = read_balance(&env, &challenger.pubkey());
    do_settle(&mut env, &caller, &curated, &challenger, &submitter).assert_success();

    let item = read_item(&env, &curated);
    assert_eq!(item.state, ItemState::Removed, "failed → Removed");
    assert_eq!(item.accumulated_stake, 0, "accounting zeroed");
    assert_eq!(item.active_dispute, Pubkey::default(), "dispute unlinked");
    assert_eq!(item.challenger, Pubkey::default(), "challenger cleared");
    assert_eq!(item.challenge_stake, 0, "challenge stake cleared");
    assert_eq!(
        read_balance(&env, &submitter.pubkey()),
        sub_before + env.deposit,
        "submitter refunded the accumulated stake"
    );
    assert_eq!(
        read_balance(&env, &challenger.pubkey()),
        chall_before + challenge_stake,
        "challenger stake returned (no bounty)"
    );
    assert_eq!(read_vault(&env), 0, "vault fully drained for this item");
}
