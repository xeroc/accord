#![cfg(feature = "no-entrypoint")]
#![allow(dead_code)]
//! RECLAIM-LEAF slot-recycling tests (spec RECLAIM-LEAF.md).
//!
//! Exercises the free-list linked-list allocator that closes the permanent
//! DoS hole where `next_index` is monotonic and can be exhausted by a
//! griefing attacker:
//!
//! - `reclaim_slot` happy path: drained juror → root blanked, free list pushed
//! - `reclaim_slot` rejects non-drained (staked/active_draws/stake_delta/fees_earned)
//! - `reclaim_slot` rejects double-reclaim
//! - `stake` pops from free list (index recycled, head advances, freed account closed)
//! - `stake` rejects wrong freed-slot account (PDA / tree_index mismatch)
//! - Full attack + recovery cycle (fill → reclaim → re-stake with new jurors)
//! - Re-stake before reclaim (existing behavior preserved)
//! - Re-stake after reclaim (fresh account, new slot)
//!
//! Run via `make test_unit`. One fresh `AnchorLiteSVM` context per test.

use accord::constants::{SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD, WITHDRAWAL_DELAY};
use accord::state::{
    Aggregation, CreateSubaccordParams, JurorStake, MSTNode, ShortfallPolicy, Subaccord,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize, AccountSerialize, AnchorSerialize, Space};
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use solana_program::hash::hashv;
use solana_program::instruction::AccountMeta;
use solana_program::pubkey::Pubkey;
use solana_sdk::account::Account as SvmAccount;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use solana_sdk::sysvar::clock::Clock;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::solana_program::program_option::COption;
use spl_token::solana_program::program_pack::Pack;
use spl_token::state::{Account as SplTokenAccount, AccountState, Mint as SplMint};
use spl_token::ID as TOKEN_PROGRAM_ID;
use std::path::PathBuf;

// ─── helpers: MST hashing (must match lib.rs mst_leaf_hash / mst_node_hash) ──

fn mst_leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}

fn mst_node_hash(lh: &[u8; 32], ls: u64, rh: &[u8; 32], rs: u64) -> [u8; 32] {
    hashv(&[lh, &ls.to_le_bytes(), rh, &rs.to_le_bytes()]).to_bytes()
}

fn empty_tree_root(depth: u8) -> [u8; 32] {
    let mut h = mst_leaf_hash(&Pubkey::default(), 0);
    for _ in 0..depth {
        h = mst_node_hash(&h, 0, &h, 0);
    }
    h
}

/// Build a depth-`depth` subtree-sum tree from `leaves` (index = position),
/// padding the remaining `2^depth` slots with zero leaves. Returns
/// `(root_hash, root_sum, path_for(target))`.
fn build_root_and_path(
    leaves: &[(Pubkey, u64)],
    depth: u8,
    target: u32,
) -> ([u8; 32], u64, Vec<MSTNode>) {
    let size = 1usize << depth;
    let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(size);
    let mut sums: Vec<u64> = Vec::with_capacity(size);
    for i in 0..size {
        let (j, s) = if i < leaves.len() {
            leaves[i]
        } else {
            (Pubkey::default(), 0u64)
        };
        hashes.push(mst_leaf_hash(&j, s));
        sums.push(s);
    }
    let mut path = Vec::new();
    let mut idx = target as usize;
    for _ in 0..depth {
        let sib = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
        path.push(MSTNode {
            sibling_hash: hashes[sib],
            sibling_sum: sums[sib],
        });
        let mut nh = Vec::new();
        let mut ns = Vec::new();
        for k in (0..hashes.len()).step_by(2) {
            nh.push(mst_node_hash(
                &hashes[k],
                sums[k],
                &hashes[k + 1],
                sums[k + 1],
            ));
            ns.push(sums[k] + sums[k + 1]);
        }
        hashes = nh;
        sums = ns;
        idx /= 2;
    }
    (hashes[0], sums[0], path)
}

// ─── helpers: SPL token account fabrication for LiteSVM ──────────────────────

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

const SPL_RENT: u64 = 1_000_000_000;

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

fn vault_ata(subaccord: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(subaccord, mint, &TOKEN_PROGRAM_ID)
}

fn juror_ata(juror: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(juror, mint, &TOKEN_PROGRAM_ID)
}

fn spl_balance(env: &AccEnv, ata: &Pubkey) -> u64 {
    u64::from_le_bytes(
        env.ctx.svm.get_account(ata).unwrap().data[64..72]
            .try_into()
            .unwrap(),
    )
}

fn juror_stake_pda(subaccord: &Pubkey, juror: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_JUROR_STAKE, subaccord.as_ref(), juror.as_ref()], &ID).0
}

fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type], &ID).0
}

fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}

// ─── shared setup ────────────────────────────────────────────────────────────

struct AccEnv {
    ctx: anchor_litesvm::AnchorContext,
    creator: Keypair,
    mint: Pubkey,
    subaccord: Pubkey,
}

/// Small depth for fast fill/exhaustion tests.
const TEST_DEPTH: u8 = 3;

fn setup_accumulator() -> AccEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());

    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    // PauseState singleton (unpaused).
    let pause = pause_pda();
    let ix = ctx
        .program()
        .accounts(accounts::InitializePause {
            authority: creator.pubkey(),
            pause_state: pause,
            system_program: system_program::ID,
        })
        .args(instruction::InitializePause {})
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    // Mint.
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    // Subaccord over the mint.
    let risk_type = {
        let mut rt = [0u8; 32];
        rt[0] = 99; // distinct from accumulator_litesvm
        rt
    };
    let sub = subaccord_pda(&creator.pubkey(), &risk_type);
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord: sub,
            staking_token: mint,
            fee_token: mint,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: [0u8; 32],
            params: CreateSubaccordParams {
                min_stake: 1_000,
                alpha_bps: 1_000,
                review_window: 60,
                commit_window: 60,
                reveal_window: 60,
                appeal_window: accord::constants::MIN_APPEAL_WINDOW_SECS,
                max_appeals: 3,
                aggregation: Aggregation::Plurality,
                fee_per_juror: 1_000_000,
                reveal_threshold_bps: 6_666,
                shortfall_policy: ShortfallPolicy::Redraw,
                max_draw_attempts: 3,
                authority: creator.pubkey(),
                evidence_operator: creator.pubkey(),
                depth: TEST_DEPTH,
            },
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    AccEnv {
        ctx,
        creator,
        mint,
        subaccord: sub,
    }
}

fn arm_juror(env: &mut AccEnv, juror: &Keypair, token_balance: u64) {
    env.ctx
        .svm
        .airdrop(&juror.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let jata = juror_ata(&juror.pubkey(), &env.mint);
    create_token_account(
        &mut env.ctx,
        &jata,
        &env.mint,
        &juror.pubkey(),
        token_balance,
    );
    let vata = vault_ata(&env.subaccord, &env.mint);
    if env.ctx.svm.get_account(&vata).is_none() {
        create_token_account(&mut env.ctx, &vata, &env.mint, &env.subaccord, 0);
    }
}

fn read_subaccord(env: &AccEnv) -> Subaccord {
    let acc = env
        .ctx
        .svm
        .get_account(&env.subaccord)
        .expect("subaccord exists");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_juror_stake(env: &AccEnv, subaccord: &Pubkey, juror: &Pubkey) -> JurorStake {
    let pda = juror_stake_pda(subaccord, juror);
    let acc = env.ctx.svm.get_account(&pda).expect("juror stake exists");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn do_stake(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
) -> TransactionResult {
    do_stake_with_remaining(env, juror, amount, path, vec![])
}

/// `stake` with optional remaining_accounts (the freed JurorStake for free-list pop).
fn do_stake_with_remaining(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
    remaining: Vec<AccountMeta>,
) -> TransactionResult {
    let jata = juror_ata(&juror.pubkey(), &env.mint);
    let vata = vault_ata(&env.subaccord, &env.mint);
    let js = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Stake {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            juror_stake: js,
            staking_token: env.mint,
            juror_token_account: jata,
            stake_vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::Stake { amount, path })
        .instruction()
        .unwrap();

    let ix_with_meta = if remaining.is_empty() {
        ix
    } else {
        solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: {
                let mut accts = ix.accounts;
                accts.extend(remaining);
                accts
            },
            data: ix.data,
        }
    };
    env.ctx.execute_instruction(ix_with_meta, &[juror]).unwrap()
}

fn do_request_withdraw(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
) -> TransactionResult {
    let js = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::RequestWithdraw {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js,
        })
        .args(instruction::RequestWithdraw { amount, path })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

fn do_withdraw(env: &mut AccEnv, juror: &Keypair) -> TransactionResult {
    let jata = juror_ata(&juror.pubkey(), &env.mint);
    let vata = vault_ata(&env.subaccord, &env.mint);
    let js = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Withdraw {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js,
            staking_token: env.mint,
            juror_token_account: jata,
            stake_vault: vata,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::Withdraw {})
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

fn do_reclaim_slot(
    env: &mut AccEnv,
    caller: &Keypair,
    juror: &Pubkey,
    path: Vec<MSTNode>,
) -> TransactionResult {
    let js = juror_stake_pda(&env.subaccord, juror);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ReclaimSlot {
            caller: caller.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js,
        })
        .args(instruction::ReclaimSlot { path })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[caller]).unwrap()
}

fn warp_seconds(env: &mut AccEnv, secs: i64) {
    let mut clock = env.ctx.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = clock.unix_timestamp.saturating_add(secs);
    env.ctx.svm.set_sysvar::<Clock>(&clock);
}

/// Stake a juror fully, then request_withdraw + withdraw to drain them to 0.
/// Returns the juror's original tree_index.
fn stake_and_drain(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    leaves: &[(Pubkey, u64)],
) -> u32 {
    let tree_index = read_subaccord(env).next_index;
    arm_juror(env, juror, amount);
    let (_, _, path) = build_root_and_path(leaves, TEST_DEPTH, tree_index);
    do_stake(env, juror, amount, path).assert_success();

    let js = read_juror_stake(env, &env.subaccord, &juror.pubkey());
    let idx = js.tree_index;

    // Build the post-stake leaves for the withdraw path.
    let mut post_leaves: Vec<(Pubkey, u64)> = leaves.to_vec();
    while post_leaves.len() <= idx as usize {
        post_leaves.push((Pubkey::default(), 0));
    }
    post_leaves[idx as usize] = (juror.pubkey(), amount);
    let (_, _, wpath) = build_root_and_path(&post_leaves, TEST_DEPTH, idx);
    do_request_withdraw(env, juror, amount, wpath).assert_success();

    warp_seconds(env, WITHDRAWAL_DELAY + 1);
    do_withdraw(env, juror).assert_success();

    idx
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[test]
fn reclaim_slot_happy_path_blanks_leaf_and_pushes_free_list() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    // Stake the juror.
    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.tree_index, 0);
    assert_eq!(js.staked, amount);
    assert_eq!(js.next_free, u32::MAX);

    // Drain fully.
    let post = vec![(juror.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror).assert_success();

    let js2 = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js2.staked, 0);
    assert_eq!(js2.next_free, u32::MAX);

    // Reclaim: the leaf is (juror, 0), path authenticates against current root.
    let reclaimed_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed_leaves, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath).assert_success();

    // free_head should now be 0 (the reclaimed index).
    let sub = read_subaccord(&env);
    assert_eq!(
        sub.free_head, 0,
        "free_head should point to the reclaimed index"
    );

    // The JurorStake's next_free should now be u32::MAX (end of list was MAX).
    let js3 = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js3.next_free, u32::MAX, "next_free = u32::MAX = list tail");
    assert_eq!(js3.staked, 0, "staked still 0");
}

#[test]
fn reclaim_slot_rejects_staked_positive() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    // Don't withdraw — staked > 0.
    let post = vec![(juror.pubkey(), amount)];
    let (_, _, rpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let res = do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath);
    assert!(!res.is_success(), "reclaim must fail when staked > 0");
}

#[test]
fn reclaim_slot_rejects_active_draws_positive() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    // Simulate active_draws by writing directly to the account.
    let js_pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let acc = env.ctx.svm.get_account(&js_pda).unwrap();
    let mut js = JurorStake::try_deserialize(&mut &acc.data[..]).unwrap();
    js.staked = 0; // drained
    js.active_draws = 1; // but in a dispute
    let mut buf = Vec::new();
    js.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            js_pda,
            SvmAccount {
                lamports: acc.lamports,
                data: buf,
                owner: acc.owner,
                executable: acc.executable,
                rent_epoch: acc.rent_epoch,
            },
        )
        .unwrap();

    let reclaimed_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed_leaves, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let res = do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath);
    assert!(!res.is_success(), "reclaim must fail when active_draws > 0");
}

#[test]
fn reclaim_slot_rejects_fees_earned_positive() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    // Simulate drained but fees_earned > 0.
    let js_pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let acc = env.ctx.svm.get_account(&js_pda).unwrap();
    let mut js = JurorStake::try_deserialize(&mut &acc.data[..]).unwrap();
    js.staked = 0;
    js.fees_earned = 500;
    let mut buf = Vec::new();
    js.try_serialize(&mut buf).unwrap();
    env.ctx
        .svm
        .set_account(
            js_pda,
            SvmAccount {
                lamports: acc.lamports,
                data: buf,
                owner: acc.owner,
                executable: acc.executable,
                rent_epoch: acc.rent_epoch,
            },
        )
        .unwrap();

    let reclaimed_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed_leaves, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let res = do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath);
    assert!(!res.is_success(), "reclaim must fail when fees_earned > 0");
}

#[test]
fn reclaim_slot_rejects_double_reclaim() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    // Drain.
    let post = vec![(juror.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror).assert_success();

    // First reclaim succeeds.
    let reclaimed_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed_leaves, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath).assert_success();

    // Second reclaim must fail (next_free != MAX).
    // After reclaim the leaf is (default, 0), so the path changes.
    let blanked_leaves = vec![(Pubkey::default(), 0)];
    let (_, _, rpath2) = build_root_and_path(&blanked_leaves, TEST_DEPTH, 0);
    let res = do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath2);
    assert!(!res.is_success(), "double reclaim must fail");
}

#[test]
fn stake_pops_from_free_list_and_closes_freed_account() {
    let mut env = setup_accumulator();
    let amount = 5_000;

    // Juror A stakes at index 0, then drains.
    let juror_a = Keypair::new();
    arm_juror(&mut env, &juror_a, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror_a, amount, path0).assert_success();

    // Drain A.
    let post_a = vec![(juror_a.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post_a, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror_a, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror_a).assert_success();

    // Reclaim A's slot.
    let reclaimed = vec![(juror_a.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller, &juror_a.pubkey(), rpath).assert_success();

    let freed_pda = juror_stake_pda(&env.subaccord, &juror_a.pubkey());
    let freed_lamports_before = env.ctx.svm.get_account(&freed_pda).unwrap().lamports;
    assert!(freed_lamports_before > 0, "freed account has rent");

    // Juror B stakes — should pop the freed slot at index 0.
    // The leaf at index 0 is now (default, 0) after reclaim.
    let juror_b = Keypair::new();
    arm_juror(&mut env, &juror_b, amount);
    let blanked = vec![(Pubkey::default(), 0)];
    let (_, _, bpath) = build_root_and_path(&blanked, TEST_DEPTH, 0);

    let remaining = vec![AccountMeta::new(freed_pda, false)];
    do_stake_with_remaining(&mut env, &juror_b, amount, bpath, remaining).assert_success();

    // B's JurorStake should be at tree_index 0.
    let js_b = read_juror_stake(&env, &env.subaccord, &juror_b.pubkey());
    assert_eq!(js_b.tree_index, 0, "B should get the recycled index 0");
    assert_eq!(js_b.staked, amount);
    assert_eq!(js_b.next_free, u32::MAX);

    // next_index should NOT have grown (slot was recycled).
    let sub = read_subaccord(&env);
    assert_eq!(
        sub.next_index, 1,
        "next_index unchanged (still 1 from A's stake)"
    );

    // free_head should be back to MAX (only A's slot was on the list).
    assert_eq!(sub.free_head, u32::MAX, "free list empty after pop");

    // Freed account should be closed (lamports drained, account gone).
    let freed_after = env.ctx.svm.get_account(&freed_pda);
    assert!(
        freed_after.is_none() || freed_after.unwrap().lamports == 0,
        "freed account should be closed (drained)"
    );

    // Rent bounty: B paid for a new PDA but received the freed account's
    // rent. Net ≈ 0 (same account size). We verify the freed account is
    // drained (above) rather than asserting a net SOL gain.
}

#[test]
fn stake_rejects_wrong_freed_slot_pda() {
    let mut env = setup_accumulator();
    let amount = 5_000;

    // Juror A stakes + drains + reclaims index 0.
    let juror_a = Keypair::new();
    arm_juror(&mut env, &juror_a, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror_a, amount, path0).assert_success();
    let post_a = vec![(juror_a.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post_a, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror_a, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror_a).assert_success();
    let reclaimed = vec![(juror_a.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller, &juror_a.pubkey(), rpath).assert_success();

    // Juror B stakes but passes a RANDOM account as the freed slot.
    let juror_b = Keypair::new();
    arm_juror(&mut env, &juror_b, amount);
    let wrong_pda = Pubkey::new_unique(); // not a real JurorStake PDA
    let blanked = vec![(Pubkey::default(), 0)];
    let (_, _, bpath) = build_root_and_path(&blanked, TEST_DEPTH, 0);
    let remaining = vec![AccountMeta::new(wrong_pda, false)];
    let res = do_stake_with_remaining(&mut env, &juror_b, amount, bpath, remaining);
    assert!(
        !res.is_success(),
        "stake must fail with a wrong freed-slot account"
    );
}

#[test]
fn full_attack_and_recovery_cycle() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let capacity = 1usize << TEST_DEPTH; // 2^3 = 8 slots

    // Phase 1: Attack — fill all slots with throwaway jurors, then drain each.
    let mut attackers: Vec<Keypair> = Vec::with_capacity(capacity);
    let mut live_leaves: Vec<(Pubkey, u64)> = Vec::new();

    for i in 0..capacity {
        let kp = Keypair::new();
        arm_juror(&mut env, &kp, amount);
        let idx = i as u32;
        let (_, _, path) = build_root_and_path(&live_leaves, TEST_DEPTH, idx);
        do_stake(&mut env, &kp, amount, path).assert_success();
        live_leaves.push((kp.pubkey(), amount));
        attackers.push(kp);
    }

    let sub = read_subaccord(&env);
    assert_eq!(sub.next_index as usize, capacity, "all slots consumed");
    assert_eq!(sub.staker_count as usize, capacity);

    // Attempt to stake a new juror → TreeFull.
    let victim = Keypair::new();
    arm_juror(&mut env, &victim, amount);
    // TreeFull fires before path verification, so an empty path suffices.
    let res = do_stake(&mut env, &victim, amount, vec![]);
    assert!(
        !res.is_success(),
        "TreeFull expected when next_index at capacity"
    );

    // Drain all attackers (request_withdraw + withdraw).
    for kp in &attackers {
        let js = read_juror_stake(&env, &env.subaccord, &kp.pubkey());
        let idx = js.tree_index as usize;
        let (_, _, wpath) = build_root_and_path(&live_leaves, TEST_DEPTH, js.tree_index);
        do_request_withdraw(&mut env, kp, amount, wpath).assert_success();
        live_leaves[idx] = (kp.pubkey(), 0);
    }
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    for kp in &attackers {
        do_withdraw(&mut env, kp).assert_success();
    }

    let sub = read_subaccord(&env);
    assert_eq!(sub.staker_count, 0, "all attackers withdrew");

    // Phase 2: Reclaim all slots.
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    for kp in &attackers {
        let idx = read_juror_stake(&env, &env.subaccord, &kp.pubkey()).tree_index;
        let (_, _, rpath) = build_root_and_path(&live_leaves, TEST_DEPTH, idx);
        do_reclaim_slot(&mut env, &caller, &kp.pubkey(), rpath).assert_success();
        // After reclaim, the leaf is blanked to (default, 0).
        live_leaves[idx as usize] = (Pubkey::default(), 0);
    }

    let sub = read_subaccord(&env);
    assert_ne!(sub.free_head, u32::MAX, "free list should be non-empty");

    // Phase 3: New legitimate jurors stake into recycled slots.
    for _ in 0..capacity {
        let new_juror = Keypair::new();
        arm_juror(&mut env, &new_juror, amount);

        // Read the current free_head to find the freed JurorStake.
        let free_head = read_subaccord(&env).free_head;
        // Find the attacker whose JurorStake has tree_index == free_head.
        // (In tests we scan; in production the cranker reads this off-chain.)
        let freed_attacker = attackers
            .iter()
            .find(|kp| {
                let pda = juror_stake_pda(&env.subaccord, &kp.pubkey());
                env.ctx.svm.get_account(&pda).is_some() && {
                    let acc = env.ctx.svm.get_account(&pda).unwrap();
                    let js = JurorStake::try_deserialize(&mut &acc.data[..]).unwrap();
                    js.tree_index == free_head
                }
            })
            .expect("found freed head node");
        let freed_pda = juror_stake_pda(&env.subaccord, &freed_attacker.pubkey());

        let (_, _, path) = build_root_and_path(&live_leaves, TEST_DEPTH, free_head);
        let remaining = vec![AccountMeta::new(freed_pda, false)];
        do_stake_with_remaining(&mut env, &new_juror, amount, path, remaining).assert_success();

        live_leaves[free_head as usize] = (new_juror.pubkey(), amount);
    }

    // Verify full recovery: all slots occupied, next_index unchanged, staker_count correct.
    let sub = read_subaccord(&env);
    assert_eq!(
        sub.next_index as usize, capacity,
        "next_index never exceeded capacity"
    );
    assert_eq!(
        sub.free_head,
        u32::MAX,
        "free list exhausted (all slots re-occupied)"
    );
    assert_eq!(sub.staker_count as usize, capacity, "all new jurors active");
}

#[test]
fn re_stake_before_reclaim_preserves_existing_behavior() {
    let mut env = setup_accumulator();
    let amount = 5_000;
    let restake_amount = 4_000; // different to avoid LiteSVM tx dedup

    // Juror stakes, drains, re-stakes WITHOUT reclaim.
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    let post = vec![(juror.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror).assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 0);
    assert_eq!(js.tree_index, 0);
    assert_eq!(js.next_free, u32::MAX);

    // Re-stake: is_new_leaf = false. A's ATA has tokens from the withdraw.
    let zeroed = vec![(juror.pubkey(), 0)];
    let (_, _, rspath) = build_root_and_path(&zeroed, TEST_DEPTH, 0);
    // No remaining_accounts needed (free list is empty).
    do_stake(&mut env, &juror, restake_amount, rspath).assert_success();

    let js2 = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js2.tree_index, 0, "re-stake keeps the original slot");
    assert_eq!(js2.staked, restake_amount);
    assert_eq!(js2.next_free, u32::MAX);

    // next_index should NOT have grown (it was already 1 from the first stake).
    let sub = read_subaccord(&env);
    assert_eq!(sub.next_index, 1, "next_index unchanged on re-stake");
    assert_eq!(sub.free_head, u32::MAX, "free list untouched");
}

#[test]
fn re_stake_after_reclaim_gets_fresh_slot() {
    let mut env = setup_accumulator();
    let amount = 5_000;

    // Juror A stakes, drains, reclaims. Then juror B claims A's old slot.
    let juror_a = Keypair::new();
    arm_juror(&mut env, &juror_a, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror_a, amount, path0).assert_success();
    let post_a = vec![(juror_a.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post_a, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror_a, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror_a).assert_success();
    let reclaimed = vec![(juror_a.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller, &juror_a.pubkey(), rpath).assert_success();

    // A's account still exists as a free-list node (not closed yet).
    let freed_pda = juror_stake_pda(&env.subaccord, &juror_a.pubkey());
    assert!(
        env.ctx.svm.get_account(&freed_pda).is_some(),
        "A's account exists as list node"
    );

    // Juror B claims the slot → A's account is closed.
    let juror_b = Keypair::new();
    arm_juror(&mut env, &juror_b, amount);
    let blanked = vec![(Pubkey::default(), 0)];
    let (_, _, bpath) = build_root_and_path(&blanked, TEST_DEPTH, 0);
    let remaining = vec![AccountMeta::new(freed_pda, false)];
    do_stake_with_remaining(&mut env, &juror_b, amount, bpath, remaining).assert_success();

    // A's old account should be closed.
    assert!(
        env.ctx.svm.get_account(&freed_pda).is_none()
            || env.ctx.svm.get_account(&freed_pda).unwrap().lamports == 0,
        "A's old JurorStake closed after B claimed the slot"
    );

    // A can now stake again with a FRESH account at a new slot.
    // A stakes again: A's ATA has tokens from the withdraw. A's old PDA was
    // closed by B's stake, so init_if_needed creates a fresh account.
    let live = vec![(juror_b.pubkey(), amount)];
    let (_, _, apath) = build_root_and_path(&live, TEST_DEPTH, 1);
    do_stake(&mut env, &juror_a, amount, apath).assert_success();

    let js_a = read_juror_stake(&env, &env.subaccord, &juror_a.pubkey());
    assert_eq!(js_a.tree_index, 1, "A gets a new slot (index 1)");
    assert_eq!(js_a.staked, amount);
    assert_eq!(js_a.next_free, u32::MAX);

    let sub = read_subaccord(&env);
    assert_eq!(
        sub.next_index, 2,
        "next_index = 2 (index 0 recycled, index 1 bumped)"
    );
}

#[test]
fn create_subaccord_inits_free_head_to_max() {
    let env = setup_accumulator();
    let sub = read_subaccord(&env);
    assert_eq!(
        sub.free_head,
        u32::MAX,
        "free_head must be u32::MAX at creation"
    );
}

#[test]
fn stake_inits_next_free_to_max_on_first_stake() {
    let mut env = setup_accumulator();
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 5_000);
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path).assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(
        js.next_free,
        u32::MAX,
        "next_free must be u32::MAX on a live juror"
    );
}
