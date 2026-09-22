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

use accord::constants::{SEED_JUROR_STAKE, WITHDRAWAL_DELAY};
use accord::state::{
    Aggregation, CreateSubaccordParams, JurorStake, MSTNode, ShortfallPolicy, Subaccord,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize, AccountSerialize};
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

// ─── helpers: MST hashing (must match utils.rs mst_leaf_hash / mst_node_hash) ──

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
        let sib = if idx.is_multiple_of(2) {
            idx + 1
        } else {
            idx - 1
        };
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

fn subaccord_pda(creator: &Pubkey, domain_ref: &[u8; 32]) -> Pubkey {
    accord::subaccord_pda(creator, domain_ref).0
}

fn pause_pda() -> Pubkey {
    accord::accord_state_pda().0
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

    // AccordState singleton (unpaused).
    let pause = pause_pda();
    let ix = ctx
        .program()
        .accounts(accounts::InitializePause {
            authority: creator.pubkey(),
            accord_state: pause,
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
    let domain_ref = {
        let mut rt = [0u8; 32];
        rt[0] = 99; // distinct from accumulator_litesvm
        rt
    };
    let sub = subaccord_pda(&creator.pubkey(), &domain_ref);
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
            domain_ref,
            evidence_spec: [0u8; 32],
            params: CreateSubaccordParams {
                min_stake: 1_000,
                alpha_bps: 1_000,
                review_window: 60,
                commit_window: 60,
                reveal_window: 60,
                appeal_window: accord::constants::MIN_APPEAL_WINDOW_SECS,
                max_appeals: 3,
                min_jury_size: 3,
                aggregation: Aggregation::Plurality,
                fee_per_juror: 50,
                reveal_threshold_bps: 6_666,
                coherence_tol_bps: 0,
                shortfall_policy: ShortfallPolicy::Redraw,
                max_draw_attempts: 3,
                authority: creator.pubkey(),
                evidence_operator: creator.pubkey(),
                depth: TEST_DEPTH,
                juror_credential: Pubkey::default(),
                juror_schema: Pubkey::default(),
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
            accord_state: pause_pda(),
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

/// `reclaim_slot` with optional remaining_accounts (the current free-list
/// head's JurorStake — required by the program when the list is non-empty).
fn do_reclaim_slot_with_remaining(
    env: &mut AccEnv,
    caller: &Keypair,
    juror: &Pubkey,
    path: Vec<MSTNode>,
    remaining: Vec<AccountMeta>,
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
    env.ctx
        .execute_instruction(ix_with_meta, &[caller])
        .unwrap()
}

/// Find the juror whose on-chain `tree_index == wanted` and return
/// `(pda, deserialized JurorStake)`.
fn node_for_index(env: &AccEnv, jurors: &[&Keypair], wanted: u32) -> (Pubkey, JurorStake) {
    for kp in jurors {
        let pda = juror_stake_pda(&env.subaccord, &kp.pubkey());
        if let Some(acc) = env.ctx.svm.get_account(&pda) {
            if let Ok(js) = JurorStake::try_deserialize(&mut &acc.data[..]) {
                if js.tree_index == wanted {
                    return (pda, js);
                }
            }
        }
    }
    panic!("no JurorStake found with tree_index {wanted}");
}

/// Walk the on-chain free list head→tail and assert the bidirectional
/// invariant (accord-b5v5): head.prev == MAX, every adjacent pair
/// (a→b) satisfies a.next == b && b.prev == a, tail.next == MAX.
/// `expected` is the head→tail sequence of tree indices; `jurors` maps
/// every index to its account.
fn assert_free_list(env: &AccEnv, expected: &[u32], jurors: &[&Keypair]) {
    let sub = read_subaccord(env);
    if expected.is_empty() {
        assert_eq!(sub.free_head, u32::MAX, "free list must be empty");
    } else {
        assert_eq!(sub.free_head, expected[0], "head must be expected");
    }
    let mut prev_idx = u32::MAX;
    for (i, &idx) in expected.iter().enumerate() {
        let (_, js) = node_for_index(env, jurors, idx);
        assert_eq!(js.tree_index, idx);
        assert_eq!(
            js.prev_free, prev_idx,
            "node {idx} (pos {i}): prev_free must point at the preceding node"
        );
        let next_idx = expected.get(i + 1).copied().unwrap_or(u32::MAX);
        assert_eq!(
            js.next_free, next_idx,
            "node {idx} (pos {i}): next_free must point at the following node"
        );
        prev_idx = idx;
    }
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
fn reclaim_slot_rejects_pending_withdrawal() {
    // H-1 (security review 2026-08-19): a juror with a *pending* withdrawal is
    // drained in the accumulator (staked == 0) but their tokens are still
    // banked in `pending_withdrawal`, custodied by this JurorStake. Reclaiming
    // the slot now would let the next `stake` free-list pop close the account
    // and permanently trap the banked tokens — reclaim must fail until the
    // two-phase withdraw completes.
    let mut env = setup_accumulator();
    let amount = 5_000;
    let juror = Keypair::new();

    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();

    // Phase 1 only: request_withdraw banks the full stake, zeroes `staked`,
    // and starts the WITHDRAWAL_DELAY timelock. Do NOT call `withdraw`.
    let post = vec![(juror.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, amount, wpath).assert_success();
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 0);
    assert_eq!(js.pending_withdrawal, amount);

    // Reclaim while the withdrawal is pending must fail. The leaf is already
    // (juror, 0), so the path itself is valid — only the new gate rejects it.
    let pending_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&pending_leaves, TEST_DEPTH, 0);
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let res = do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath);
    assert!(
        !res.is_success(),
        "reclaim must fail while a withdrawal is pending; error: {:?}",
        res.error()
    );

    // Complete the two-phase withdraw, then reclaim succeeds (gate is precise,
    // not over-broad). A FRESH cranker signs the retry: the failed reclaim
    // above recorded this blockhash + message signature, so an identical
    // caller/account-set would replay as AlreadyProcessed (litesvm mimics the
    // runtime's failed-tx signature cache).
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror).assert_success();
    let drained_leaves = vec![(juror.pubkey(), 0)];
    let (_, _, rpath2) = build_root_and_path(&drained_leaves, TEST_DEPTH, 0);
    let caller2 = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller2.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    do_reclaim_slot(&mut env, &caller2, &juror.pubkey(), rpath2).assert_success();
    assert_eq!(read_subaccord(&env).free_head, 0);
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
    let attacker_refs: Vec<&Keypair> = attackers.iter().collect();
    for kp in &attackers {
        let idx = read_juror_stake(&env, &env.subaccord, &kp.pubkey()).tree_index;
        let (_, _, rpath) = build_root_and_path(&live_leaves, TEST_DEPTH, idx);
        // accord-b5v5: a push onto a NON-empty list must pass the current
        // head's account so its prev_free can be rewired.
        let head = read_subaccord(&env).free_head;
        let remaining = if head != u32::MAX {
            vec![AccountMeta::new(
                node_for_index(&env, &attacker_refs, head).0,
                false,
            )]
        } else {
            vec![]
        };
        do_reclaim_slot_with_remaining(&mut env, &caller, &kp.pubkey(), rpath, remaining)
            .assert_success();
        // After reclaim, the leaf is blanked to (default, 0).
        live_leaves[idx as usize] = (Pubkey::default(), 0);
    }
    // Reclaimed in index order → LIFO list: 7 → 6 → … → 0.
    assert_free_list(&env, &[7, 6, 5, 4, 3, 2, 1, 0], &attacker_refs);

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
        let (freed_pda, freed_js) = node_for_index(&env, &attacker_refs, free_head);

        // accord-b5v5: when the freed head has a successor, its account must
        // ride along so the new head's prev_free can be cleared.
        let remaining = if freed_js.next_free != u32::MAX {
            let (succ_pda, _) = node_for_index(&env, &attacker_refs, freed_js.next_free);
            vec![
                AccountMeta::new(freed_pda, false),
                AccountMeta::new(succ_pda, false),
            ]
        } else {
            vec![AccountMeta::new(freed_pda, false)]
        };
        let (_, _, path) = build_root_and_path(&live_leaves, TEST_DEPTH, free_head);
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
fn re_stake_after_reclaim_reclaims_own_head_slot() {
    // SR2-M-2 (security review 2026-08-19): a drained juror whose slot was
    // reclaimed keeps their JurorStake (subaccord set, leaf blanked to
    // (default, 0)) — the top-up path would hash (juror, 0) against that
    // root and fail InvalidMerklePath forever. When the slot is the
    // free-list head, `stake` must re-claim it in place: splice off the
    // head, re-open the leaf, no fresh allocation.
    let mut env = setup_accumulator();
    let amount = 5_000;

    // Stake at index 0, then drain fully (two-phase withdraw).
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, amount);
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, amount, path0).assert_success();
    let post = vec![(juror.pubkey(), amount)];
    let (_, _, wpath) = build_root_and_path(&post, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, amount, wpath).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror).assert_success();

    // Griefer reclaims the drained slot (permissionless) → head = 0. This is
    // the tail case: the node's next_free is MAX (single-entry list).
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let reclaimed = vec![(juror.pubkey(), 0)];
    let (_, _, rpath) = build_root_and_path(&reclaimed, TEST_DEPTH, 0);
    do_reclaim_slot(&mut env, &caller, &juror.pubkey(), rpath).assert_success();
    assert_eq!(read_subaccord(&env).free_head, 0);
    // Different from the opening amount — after the full drain + reclaim the
    // tree returns to the empty root, making the re-stake tx byte-identical
    // to the first stake otherwise (LiteSVM dedups).
    let restake = 4_000;
    // The drained juror re-stakes: leaf (default, 0) → (juror, amount).
    let blanked = vec![(Pubkey::default(), 0)];
    let (_, _, spath) = build_root_and_path(&blanked, TEST_DEPTH, 0);
    do_stake(&mut env, &juror, restake, spath).assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.tree_index, 0, "own slot re-claimed in place");
    assert_eq!(js.staked, restake);
    assert_eq!(js.next_free, u32::MAX, "no longer a free-list node");
    let sub = read_subaccord(&env);
    assert_eq!(sub.free_head, u32::MAX, "head spliced off");
    assert_eq!(sub.next_index, 1, "no fresh allocation");
    assert_eq!(sub.staker_count, 1);
    assert_eq!(sub.total_stake, restake, "root sum restored");
}

/// Reclaim `juror`'s slot (at `idx`), auto-passing the current free-list
/// head's account as remaining_accounts[0] when the list is non-empty.
fn reclaim_with_head(
    env: &mut AccEnv,
    caller: &Keypair,
    juror: &Keypair,
    leaves: &[(Pubkey, u64)],
    idx: u32,
    jurors: &[&Keypair],
) {
    let (_, _, path) = build_root_and_path(leaves, TEST_DEPTH, idx);
    let head = read_subaccord(env).free_head;
    let remaining = if head != u32::MAX {
        vec![AccountMeta::new(node_for_index(env, jurors, head).0, false)]
    } else {
        vec![]
    };
    do_reclaim_slot_with_remaining(env, caller, &juror.pubkey(), path, remaining).assert_success();
}

/// Own-slot re-stake via the doubly-linked splice (accord-b5v5): derives the
/// [predecessor?, successor?] neighbor accounts from the juror's OWN
/// free-list pointers and passes them as remaining accounts.
fn splice_stake(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    leaves: &[(Pubkey, u64)],
    idx: u32,
    jurors: &[&Keypair],
) {
    let js = read_juror_stake(env, &env.subaccord, &juror.pubkey());
    let (_, _, path) = build_root_and_path(leaves, TEST_DEPTH, idx);
    let mut remaining = vec![];
    if js.prev_free != u32::MAX {
        remaining.push(AccountMeta::new(
            node_for_index(env, jurors, js.prev_free).0,
            false,
        ));
    }
    if js.next_free != u32::MAX {
        remaining.push(AccountMeta::new(
            node_for_index(env, jurors, js.next_free).0,
            false,
        ));
    }
    do_stake_with_remaining(env, juror, amount, path, remaining).assert_success();
}

#[test]
fn re_stake_mid_free_list_splices_in_place() {
    // accord-b5v5: the free list is doubly linked — a drained juror whose
    // reclaimed slot sits MID-list re-stakes in ONE tx by splicing the node
    // out (prev.next = my.next, succ.prev = my.prev), passing the neighbor
    // accounts. The SR2-M-2 singly-linked residual (SlotAwaitingRecycle
    // burial grief) is closed.
    let mut env = setup_accumulator();
    let amount = 5_000;
    let restake = 4_000; // distinct from `amount` (LiteSVM tx dedup)

    // Four jurors stake at indices 0..3 and fully drain.
    let juror_a = Keypair::new();
    let juror_b = Keypair::new();
    let juror_c = Keypair::new();
    let juror_d = Keypair::new();
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    let idx_a = stake_and_drain(&mut env, &juror_a, amount, &leaves);
    leaves.push((juror_a.pubkey(), 0));
    let idx_b = stake_and_drain(&mut env, &juror_b, amount, &leaves);
    leaves.push((juror_b.pubkey(), 0));
    let idx_c = stake_and_drain(&mut env, &juror_c, amount, &leaves);
    leaves.push((juror_c.pubkey(), 0));
    let idx_d = stake_and_drain(&mut env, &juror_d, amount, &leaves);
    leaves.push((juror_d.pubkey(), 0));
    assert_eq!((idx_a, idx_b, idx_c, idx_d), (0, 1, 2, 3));
    let jurors = [&juror_a, &juror_b, &juror_c, &juror_d];

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    // Reclaim order b, a, d, c → list (head→tail): c(2) → d(3) → a(0) → b(1).
    // A is buried behind TWO nodes and holds BOTH neighbors: prev = d(3),
    // succ = b(1). (Reclaim paths are built from the PRE-blank leaves.)
    reclaim_with_head(&mut env, &caller, &juror_b, &leaves, 1, &jurors);
    leaves[1] = (Pubkey::default(), 0);
    reclaim_with_head(&mut env, &caller, &juror_a, &leaves, 0, &jurors);
    leaves[0] = (Pubkey::default(), 0);
    reclaim_with_head(&mut env, &caller, &juror_d, &leaves, 3, &jurors);
    leaves[3] = (Pubkey::default(), 0);
    reclaim_with_head(&mut env, &caller, &juror_c, &leaves, 2, &jurors);
    leaves[2] = (Pubkey::default(), 0);
    assert_free_list(&env, &[2, 3, 0, 1], &jurors);

    // A (mid-list, buried behind d and c) re-stakes in ONE transaction.
    splice_stake(&mut env, &juror_a, restake, &leaves, 0, &jurors);

    // List is now c(2) → d(3) → b(1): d's next skips A, b's prev skips A.
    assert_free_list(&env, &[2, 3, 1], &jurors);
    let js_a = read_juror_stake(&env, &env.subaccord, &juror_a.pubkey());
    assert_eq!(js_a.tree_index, 0, "own slot re-claimed in place");
    assert_eq!(js_a.staked, restake);
    assert_eq!(js_a.next_free, u32::MAX, "no longer a free-list node");
    assert_eq!(js_a.prev_free, u32::MAX, "no longer a free-list node");
    let sub = read_subaccord(&env);
    assert_eq!(sub.next_index, 4, "no fresh allocation");
    assert_eq!(sub.staker_count, 1);
    assert_eq!(sub.total_stake, restake, "root sum restored");

    // B is now the TAIL (prev = d only) — tail splice needs the predecessor
    // alone.
    let mut leaves_after_a = leaves.clone();
    leaves_after_a[0] = (juror_a.pubkey(), restake);
    splice_stake(&mut env, &juror_b, restake, &leaves_after_a, 1, &jurors);
    assert_free_list(&env, &[2, 3], &jurors);
    let sub = read_subaccord(&env);
    assert_eq!(sub.free_head, 2);
    assert_eq!(sub.staker_count, 2);
    assert_eq!(sub.total_stake, 2 * restake);
}

#[test]
fn stake_mid_splice_rejects_wrong_predecessor() {
    // M-2 discipline: every raw free-list account is verified (owner, PDA
    // re-derivation, tree_index, adjacency). A wrong-but-valid account or a
    // fabricated key reverts FreeListHeadMismatch and leaves the list intact.
    let mut env = setup_accumulator();
    let amount = 5_000;

    let juror_a = Keypair::new();
    let juror_b = Keypair::new();
    let juror_c = Keypair::new();
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    stake_and_drain(&mut env, &juror_a, amount, &leaves);
    leaves.push((juror_a.pubkey(), 0));
    stake_and_drain(&mut env, &juror_b, amount, &leaves);
    leaves.push((juror_b.pubkey(), 0));
    stake_and_drain(&mut env, &juror_c, amount, &leaves);
    leaves.push((juror_c.pubkey(), 0));
    let jurors = [&juror_a, &juror_b, &juror_c];

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    // Reclaim b, a, c → list (head→tail): c(2) → a(0) → b(1). A is mid-list
    // (prev = c, succ = b). (Paths are built from the PRE-blank leaves.)
    reclaim_with_head(&mut env, &caller, &juror_b, &leaves, 1, &jurors);
    leaves[1] = (Pubkey::default(), 0);
    reclaim_with_head(&mut env, &caller, &juror_a, &leaves, 0, &jurors);
    leaves[0] = (Pubkey::default(), 0);
    reclaim_with_head(&mut env, &caller, &juror_c, &leaves, 2, &jurors);
    leaves[2] = (Pubkey::default(), 0);
    assert_free_list(&env, &[2, 0, 1], &jurors);

    // Attempt 1: B's PDA in the predecessor slot (valid account, wrong
    // position — B is A's SUCCESSOR). tree_index check fails.
    let b_pda = juror_stake_pda(&env.subaccord, &juror_b.pubkey());
    let (_, _, path0) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let res = do_stake_with_remaining(
        &mut env,
        &juror_a,
        amount,
        path0.clone(),
        vec![AccountMeta::new(b_pda, false)],
    );
    assert!(!res.is_success(), "wrong predecessor must revert");
    assert!(
        res.logs().join("\n").contains("FreeListHeadMismatch"),
        "expected FreeListHeadMismatch, got: {:?}",
        res.logs()
    );
    assert_free_list(&env, &[2, 0, 1], &jurors);

    // Attempt 2: a fabricated (non-existent) account as predecessor.
    let fake = Pubkey::new_unique();
    let res = do_stake_with_remaining(
        &mut env,
        &juror_a,
        amount,
        path0,
        vec![AccountMeta::new(fake, false)],
    );
    assert!(!res.is_success(), "fabricated predecessor must revert");
    assert_free_list(&env, &[2, 0, 1], &jurors);

    // The correct splice still succeeds afterwards — the list was untouched.
    splice_stake(&mut env, &juror_a, amount, &leaves, 0, &jurors);
    assert_free_list(&env, &[2, 1], &jurors);
}

#[test]
fn free_list_bidirectional_invariant_across_mutations() {
    // accord-b5v5 acceptance: prev↔next holds across push, pop, head-splice,
    // tail/mid-splice, and exhaustion (empty list ⇒ head = MAX, no node
    // claims a predecessor).
    let mut env = setup_accumulator();
    let amount = 5_000;
    let restake = 4_000;

    let juror_a = Keypair::new();
    let juror_b = Keypair::new();
    let juror_c = Keypair::new();
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    stake_and_drain(&mut env, &juror_a, amount, &leaves);
    leaves.push((juror_a.pubkey(), 0));
    stake_and_drain(&mut env, &juror_b, amount, &leaves);
    leaves.push((juror_b.pubkey(), 0));
    stake_and_drain(&mut env, &juror_c, amount, &leaves);
    leaves.push((juror_c.pubkey(), 0));
    let mut jurors: Vec<&Keypair> = vec![&juror_a, &juror_b, &juror_c];

    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    // --- push ×3 (each onto a non-empty list passes the old head; paths
    // are built from the PRE-blank leaves) ---
    reclaim_with_head(&mut env, &caller, &juror_a, &leaves, 0, &jurors);
    leaves[0] = (Pubkey::default(), 0);
    assert_free_list(&env, &[0], &jurors);
    reclaim_with_head(&mut env, &caller, &juror_b, &leaves, 1, &jurors);
    leaves[1] = (Pubkey::default(), 0);
    assert_free_list(&env, &[1, 0], &jurors);
    reclaim_with_head(&mut env, &caller, &juror_c, &leaves, 2, &jurors);
    leaves[2] = (Pubkey::default(), 0);
    assert_free_list(&env, &[2, 1, 0], &jurors);

    // --- pop (head has a successor: new head's prev_free must clear) ---
    let juror_e = Keypair::new();
    arm_juror(&mut env, &juror_e, amount);
    let c_pda = juror_stake_pda(&env.subaccord, &juror_c.pubkey());
    let b_pda = juror_stake_pda(&env.subaccord, &juror_b.pubkey());
    let (_, _, epath) = build_root_and_path(&leaves, TEST_DEPTH, 2);
    do_stake_with_remaining(
        &mut env,
        &juror_e,
        amount,
        epath,
        vec![
            AccountMeta::new(c_pda, false),
            AccountMeta::new(b_pda, false),
        ],
    )
    .assert_success();
    assert_free_list(&env, &[1, 0], &jurors);
    leaves[2] = (juror_e.pubkey(), amount);
    jurors.push(&juror_e);

    // --- head-splice (B re-claims the head slot; successor's prev rewires) ---
    splice_stake(&mut env, &juror_b, restake, &leaves, 1, &jurors);
    assert_free_list(&env, &[0], &jurors);
    leaves[1] = (juror_b.pubkey(), restake);

    // --- single-node splice (A is head AND tail: no neighbors) → exhaustion ---
    splice_stake(&mut env, &juror_a, restake, &leaves, 0, &jurors);
    assert_free_list(&env, &[], &jurors);

    // Exhaustion: head = MAX, and NO surviving node claims a list neighbor.
    let sub = read_subaccord(&env);
    assert_eq!(sub.free_head, u32::MAX);
    for kp in &jurors {
        let js = read_juror_stake(&env, &env.subaccord, &kp.pubkey());
        assert_eq!(js.next_free, u32::MAX, "no next neighbor at exhaustion");
        assert_eq!(js.prev_free, u32::MAX, "no prev neighbor at exhaustion");
    }
    assert_eq!(sub.next_index, 3);
    assert_eq!(sub.staker_count, 3);
    assert_eq!(sub.total_stake, 2 * restake + amount);
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
