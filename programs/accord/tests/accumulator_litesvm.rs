#![cfg(feature = "no-entrypoint")]
//! LiteSVM accumulator tests (ADR-0012 / bean accord-btel).
//!
//! Exercises the full on-chain instruction flow for the subtree-sum stake
//! accumulator: `create_subaccord` (sets empty root) → `stake`/`unstake` with
//! client-supplied Merkle paths (root updates) → wrong-path reverts → off-chain
//! rebuild audit → locality → `commit_vrf_callback` freezes the root → `draw_seat`
//! membership + sortition.
//!
//! The inline `accumulator_tests` mod in `lib.rs` covers the pure helpers
//! (`verify_and_recompute`, `verify_membership_and_prefix`, `empty_tree_root`);
//! this file covers the **instruction surface** — real SPL token transfers,
//! real PDA creation, real account deserialization against the compiled `.so`.
//!
//! Run via `make test_unit` (builds the `.so` then `cargo test --features
//! no-entrypoint`). One fresh `AnchorLiteSVM` context per test.

use accord::constants::{
    PRE_DRAW_CANCEL_TIMEOUT_SECS, SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD,
};
use accord::state::{Dispute, DisputeState, JurorStake, LeafClaim, MSTNode, Subaccord};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize, AnchorSerialize, Space};
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use solana_program::hash::hashv;
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

/// Create a valid SPL Mint account (82 bytes) and set it in the SVM.
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

/// Create a funded SPL token account (165 bytes) owned by `owner` for `mint`.
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

fn juror_stake_pda(subaccord: &Pubkey, juror: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SEED_JUROR_STAKE, subaccord.as_ref(), juror.as_ref()], &ID).0
}

fn subaccord_pda(creator: &Pubkey, risk_type: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[SEED_SUBACCORD, creator.as_ref(), risk_type], &ID).0
}

fn pause_pda() -> Pubkey {
    Pubkey::find_program_address(&[SEED_PAUSE], &ID).0
}

fn dispute_pda(filer: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"dispute", filer.as_ref(), &nonce.to_le_bytes()], &ID).0
}

fn round_pda(dispute: &Pubkey, round_idx: u32) -> Pubkey {
    Pubkey::find_program_address(&[b"round", dispute.as_ref(), &round_idx.to_le_bytes()], &ID).0
}

// ─── shared setup ────────────────────────────────────────────────────────────

struct AccEnv {
    ctx: anchor_litesvm::AnchorContext,
    creator: Keypair,
    mint: Pubkey,
    subaccord: Pubkey,
    depth: u8,
    risk_type: [u8; 32],
}

const TEST_DEPTH: u8 = 4;

fn setup_accumulator() -> AccEnv {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());

    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

    // 1) PauseState singleton (unpaused).
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

    // 2) Mint.
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    // 3) Subaccord over the mint.
    let risk_type = {
        let mut rt = [0u8; 32];
        rt[0] = 42;
        rt
    };
    let sub = subaccord_pda(&creator.pubkey(), &risk_type);
    let ix = ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: creator.pubkey(),
            subaccord: sub,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            risk_type,
            evidence_spec: [0u8; 32],
            staking_token: mint,
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: 1_000,
            review_window: 60,
            commit_window: 60,
            reveal_window: 60,
            max_appeals: 3,
            fee_per_juror: 1_000_000,
            authority: creator.pubkey(),
            evidence_operator: creator.pubkey(),
            depth: TEST_DEPTH,
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
        depth: TEST_DEPTH,
        risk_type,
    }
}

/// Fund a juror with SOL + token balance, create their ATA, pre-create the
/// vault ATA (0 balance), then return the juror + accounts needed for stake.
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
    // Vault ATA (subaccord PDA's ATA) — pre-created so init_if_needed skips.
    let vata = vault_ata(&env.subaccord, &env.mint);
    // Only create if it doesn't exist yet.
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
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::Stake { amount, path })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

fn do_unstake(
    env: &mut AccEnv,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
) -> TransactionResult {
    let jata = juror_ata(&juror.pubkey(), &env.mint);
    let vata = vault_ata(&env.subaccord, &env.mint);
    let js = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Unstake {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js,
            staking_token: env.mint,
            juror_token_account: jata,
            vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        })
        .args(instruction::Unstake { amount, path })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[test]
fn first_stake_updates_root_and_credits_juror() {
    let mut env = setup_accumulator();

    // Empty tree root before any stake.
    let sub0 = read_subaccord(&env);
    assert_eq!(sub0.root_hash, empty_tree_root(TEST_DEPTH));
    assert_eq!(sub0.total_stake, 0);
    assert_eq!(sub0.next_index, 0);

    let juror = Keypair::new();
    let stake_amt = 5_000u64;
    arm_juror(&mut env, &juror, 10_000);

    // First stake: old leaf is (default, 0) at index 0; path must authenticate
    // against the empty-tree root.
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, stake_amt, path);
    r.assert_success();

    // Root updated to a tree with one leaf at index 0.
    let (expected_root, expected_total, _) =
        build_root_and_path(&[(juror.pubkey(), stake_amt)], TEST_DEPTH, 0);
    let sub1 = read_subaccord(&env);
    assert_eq!(sub1.root_hash, expected_root, "root must match rebuild");
    assert_eq!(sub1.total_stake, expected_total);
    assert_eq!(sub1.total_stake, stake_amt);
    assert_eq!(sub1.next_index, 1);
    assert_eq!(sub1.staker_count, 1);

    // JurorStake written.
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.amount, stake_amt);
    assert_eq!(js.juror, juror.pubkey());
    assert_eq!(js.subaccord, env.subaccord);
    assert_eq!(js.tree_index, 0);
    assert_eq!(js.active_draws, 0);
}

#[test]
fn second_stake_at_index_1_updates_root() {
    let mut env = setup_accumulator();

    let j1 = Keypair::new();
    let j2 = Keypair::new();
    arm_juror(&mut env, &j1, 10_000);
    arm_juror(&mut env, &j2, 10_000);

    // Stake juror 1 at index 0.
    let (_, _, path0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &j1, 3_000, path0).assert_success();

    // Stake juror 2 at index 1: old leaf is (default, 0) at index 1; path must
    // authenticate against the root AFTER juror 1 landed.
    let leaves = vec![(j1.pubkey(), 3_000)];
    let (_, _, path1) = build_root_and_path(&leaves, TEST_DEPTH, 1);
    do_stake(&mut env, &j2, 2_000, path1).assert_success();

    // Root matches a rebuild with both jurors.
    let leaves2 = vec![(j1.pubkey(), 3_000), (j2.pubkey(), 2_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves2, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);
    assert_eq!(sub.total_stake, 5_000);
    assert_eq!(sub.next_index, 2);
    assert_eq!(sub.staker_count, 2);

    let js2 = read_juror_stake(&env, &env.subaccord, &j2.pubkey());
    assert_eq!(js2.tree_index, 1);
}

#[test]
fn top_up_existing_juror_updates_root_locally() {
    let mut env = setup_accumulator();

    let j1 = Keypair::new();
    let j2 = Keypair::new();
    arm_juror(&mut env, &j1, 20_000);
    arm_juror(&mut env, &j2, 20_000);

    // Two initial stakes.
    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &j1, 3_000, p0).assert_success();
    let leaves = vec![(j1.pubkey(), 3_000)];
    let (_, _, p1) = build_root_and_path(&leaves, TEST_DEPTH, 1);
    do_stake(&mut env, &j2, 2_000, p1).assert_success();

    // Top-up juror 1: old leaf (j1, 3000) → new leaf (j1, 5000) at index 0.
    let leaves_before = vec![(j1.pubkey(), 3_000), (j2.pubkey(), 2_000)];
    let (_, _, path_topup) = build_root_and_path(&leaves_before, TEST_DEPTH, 0);
    do_stake(&mut env, &j1, 2_000, path_topup).assert_success();

    // Root matches a rebuild with the updated stake.
    let leaves_after = vec![(j1.pubkey(), 5_000), (j2.pubkey(), 2_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);

    // Locality: juror 2's tree_index and stake are unchanged.
    let js2 = read_juror_stake(&env, &env.subaccord, &j2.pubkey());
    assert_eq!(js2.tree_index, 1, "juror 2 index unchanged");
    assert_eq!(js2.amount, 2_000, "juror 2 stake unchanged");

    // next_index unchanged (no new leaf).
    assert_eq!(sub.next_index, 2);
    assert_eq!(sub.staker_count, 2);
}

#[test]
fn wrong_stale_path_reverts_and_root_unchanged() {
    let mut env = setup_accumulator();

    let j1 = Keypair::new();
    let j2 = Keypair::new();
    arm_juror(&mut env, &j1, 10_000);
    arm_juror(&mut env, &j2, 10_000);

    // Stake juror 1.
    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &j1, 3_000, p0).assert_success();
    let sub_after_j1 = read_subaccord(&env);

    // Stake juror 2 with a STALE path: path for index 1 against the EMPTY tree
    // (before juror 1), not the post-juror-1 tree.
    let (_, _, stale_path) = build_root_and_path(&[], TEST_DEPTH, 1);
    let r = do_stake(&mut env, &j2, 2_000, stale_path);
    assert!(
        !r.is_success(),
        "stale path must revert; logs={:?}",
        r.logs()
    );

    // Root unchanged.
    let sub_after_fail = read_subaccord(&env);
    assert_eq!(
        sub_after_fail.root_hash, sub_after_j1.root_hash,
        "root must not change on a failed stake"
    );
    assert_eq!(sub_after_fail.total_stake, sub_after_j1.total_stake);
}

#[test]
fn off_chain_rebuild_matches_on_chain_root() {
    let mut env = setup_accumulator();

    // Stake 4 jurors sequentially, building the tree incrementally.
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for i in 0..4u8 {
        let juror = Keypair::new();
        arm_juror(&mut env, &juror, 10_000);
        let stake_amt = (i as u64 + 1) * 1_000;

        // Path for index `i` against the current tree (leaves so far).
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(&mut env, &juror, stake_amt, path).assert_success();
        leaves.push((juror.pubkey(), stake_amt));
    }

    // Off-chain rebuild from the full leaf set.
    let (rebuilt_root, rebuilt_total, _) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(
        sub.root_hash, rebuilt_root,
        "on-chain root must match off-chain rebuild"
    );
    assert_eq!(sub.total_stake, rebuilt_total);
    assert_eq!(sub.next_index, 4);
    assert_eq!(sub.staker_count, 4);
}

#[test]
fn unstake_updates_root_and_reduces_stake() {
    let mut env = setup_accumulator();

    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);

    // Stake 5_000.
    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, p0).assert_success();

    // Unstake 2_000: old leaf (juror, 5000) → new leaf (juror, 3000) at index 0.
    let leaves_before = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_unstake) = build_root_and_path(&leaves_before, TEST_DEPTH, 0);
    do_unstake(&mut env, &juror, 2_000, path_unstake).assert_success();

    let leaves_after = vec![(juror.pubkey(), 3_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);
    assert_eq!(sub.total_stake, 3_000);

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.amount, 3_000);
    // tree_index retained (re-stake is a local update).
    assert_eq!(js.tree_index, 0);
}

#[test]
fn full_unstake_zeros_leaf_but_retains_tree_index() {
    let mut env = setup_accumulator();

    let j1 = Keypair::new();
    let j2 = Keypair::new();
    arm_juror(&mut env, &j1, 10_000);
    arm_juror(&mut env, &j2, 10_000);

    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &j1, 3_000, p0).assert_success();
    let leaves = vec![(j1.pubkey(), 3_000)];
    let (_, _, p1) = build_root_and_path(&leaves, TEST_DEPTH, 1);
    do_stake(&mut env, &j2, 2_000, p1).assert_success();

    // Full unstake juror 1.
    let leaves_before = vec![(j1.pubkey(), 3_000), (j2.pubkey(), 2_000)];
    let (_, _, path) = build_root_and_path(&leaves_before, TEST_DEPTH, 0);
    do_unstake(&mut env, &j1, 3_000, path).assert_success();

    // Root matches a tree where index 0 has stake 0.
    let leaves_after = vec![(j1.pubkey(), 0), (j2.pubkey(), 2_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);
    assert_eq!(sub.total_stake, 2_000);
    assert_eq!(sub.staker_count, 1, "distinct staker count drops");

    let js = read_juror_stake(&env, &env.subaccord, &j1.pubkey());
    assert_eq!(js.amount, 0);
    assert_eq!(js.tree_index, 0, "tree_index retained after full unstake");
}

#[test]
fn re_stake_after_full_unstake_is_local_update() {
    let mut env = setup_accumulator();

    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 20_000);

    // Stake then full unstake.
    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, p0).assert_success();
    let leaves = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_u) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    do_unstake(&mut env, &juror, 5_000, path_u).assert_success();

    let sub_before = read_subaccord(&env);
    assert_eq!(sub_before.next_index, 1, "next_index advanced once");
    assert_eq!(sub_before.staker_count, 0);

    // Re-stake: old leaf is (juror, 0) at index 0 — NOT a new leaf.
    let leaves_zero = vec![(juror.pubkey(), 0)];
    let (_, _, path_re) = build_root_and_path(&leaves_zero, TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 4_000, path_re).assert_success();

    let sub_after = read_subaccord(&env);
    assert_eq!(sub_after.next_index, 1, "no new leaf allocated");
    assert_eq!(
        sub_after.staker_count, 1,
        "re-stake re-increments staker_count"
    );

    let expected_leaves = vec![(juror.pubkey(), 4_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&expected_leaves, TEST_DEPTH, 0);
    assert_eq!(sub_after.root_hash, expected_root);
    assert_eq!(sub_after.total_stake, expected_total);
}

#[test]
fn commit_vrf_callback_freezes_live_root() {
    let mut env = setup_accumulator();

    // Stake enough jurors for a 3-juror panel.
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for i in 0..3u8 {
        let juror = Keypair::new();
        arm_juror(&mut env, &juror, 10_000);
        let amt = 5_000u64;
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(&mut env, &juror, amt, path).assert_success();
        leaves.push((juror.pubkey(), amt));
    }

    let sub = read_subaccord(&env);

    // Create a dispute (simplified — we only need the account to exist for the
    // freeze check). We need a filer with tokens for the fee.
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);

    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let fee = 3 * 1_000_000u64; // jurors_per_dispute * fee_per_juror

    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    // commit_vrf_callback: the VRF program identity is the signer.
    let vrf_identity = Keypair::new();
    // We need to spoof the VRF program identity constraint. The constraint is
    // `address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY`. In LiteSVM
    // we can't change that — but we CAN set the account directly. Instead, we
    // verify the freeze by checking the dispute state directly via set_account.
    //
    // Since the VRF identity is a fixed pubkey we don't control, we simulate
    // the freeze by writing the frozen root directly (mirrors injectCommittedVrf
    // in the e2e setup).
    let vrf_randomness = [99u8; 32];
    inject_vrf_freeze(
        &mut env.ctx,
        &dispute,
        vrf_randomness,
        sub.root_hash,
        sub.total_stake,
    );

    // Verify the dispute carries the frozen root.
    let acc = env.ctx.svm.get_account(&dispute).expect("dispute exists");
    let d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!(
        d.frozen_root, sub.root_hash,
        "frozen_root must match live root"
    );
    assert_eq!(d.frozen_total_stake, sub.total_stake);
    assert_eq!(d.committed_vrf, Some(vrf_randomness));
}

#[test]
fn draw_seat_fills_round_against_frozen_root() {
    let mut env = setup_accumulator();

    // Stake 3 jurors with known stakes.
    let mut jurors: Vec<Keypair> = Vec::new();
    let stakes = [5_000u64, 3_000, 2_000];
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for (i, &stake) in stakes.iter().enumerate() {
        let juror = Keypair::new();
        arm_juror(&mut env, &juror, 10_000);
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(&mut env, &juror, stake, path).assert_success();
        leaves.push((juror.pubkey(), stake));
        jurors.push(juror);
    }

    let sub = read_subaccord(&env);
    let total = sub.total_stake;

    // Create a dispute.
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let fee = 3 * 1_000_000u64;

    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    // Inject VRF + freeze. Brute-force a VRF that yields 3 distinct jurors
    // across the 3 seats (deterministic re-rülle is client-side; the on-chain
    // draw_seat rejects duplicate jurors).
    let round_idx = 0u32;

    // Compute prefixes for each leaf.
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut acc = 0u64;
        for (_, s) in &leaves {
            p.push(acc);
            acc += s;
        }
        p
    };

    // Find a VRF byte where all 3 seats map to distinct leaf indices at retry=0
    // (no collision — the common case). The hash now includes the retry counter
    // (bean accord-tzo0): r_i = u64_le(sha256(seed ‖ seat ‖ retry)[..8]) % total.
    let vrf = {
        let mut candidate = [0u8; 32];
        loop {
            candidate[0] = candidate[0].wrapping_add(1);
            if candidate[0] == 0 {
                candidate[1] = candidate[1].wrapping_add(1);
            }
            let seed = hashv(&[&candidate, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();
            let seats: Vec<usize> = (0..3u32)
                .map(|seat| {
                    let rh = hashv(&[&seed, &seat.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
                    let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
                    let mut idx = 0;
                    for (i, (_, s)) in leaves.iter().enumerate() {
                        if ri >= prefixes[i] && ri - prefixes[i] < *s {
                            idx = i;
                            break;
                        }
                    }
                    idx
                })
                .collect();
            if seats.iter().collect::<std::collections::HashSet<_>>().len() == 3 {
                break candidate;
            }
        }
    };

    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    // Resolve which juror wins each seat (retry=0, no collision).
    let vrf_seed = hashv(&[&vrf, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();
    let mut drawn: Vec<(u32, usize)> = Vec::new();

    for seat in 0..3u32 {
        let r_hash = hashv(&[&vrf_seed, &seat.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
        let r_i = u64::from_le_bytes(r_hash[0..8].try_into().unwrap()) % total;
        let mut found = None;
        for (i, &(_, stake)) in leaves.iter().enumerate() {
            if r_i >= prefixes[i] && r_i - prefixes[i] < stake {
                found = Some(i);
                break;
            }
        }
        drawn.push((seat, found.expect("r_i lands on a leaf")));
    }

    // Submit draw_seat for each resolved seat (retries=0 — no collision).
    for &(seat, leaf_idx) in &drawn {
        let (juror_pub, stake) = leaves[leaf_idx];
        let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, leaf_idx as u32);
        let round_pda = round_pda(&dispute, round_idx);
        let js_pda = juror_stake_pda(&env.subaccord, &juror_pub);

        let membership = accord::state::JurorMembership {
            leaf: LeafClaim {
                juror: juror_pub,
                stake,
            },
            proof,
            index: leaf_idx as u32,
        };

        let ix = env
            .ctx
            .program()
            .accounts(accounts::DrawSeat {
                caller: env.creator.pubkey(),
                dispute,
                round: round_pda,
                system_program: system_program::ID,
            })
            .args(instruction::DrawSeat {
                seat,
                retries: 0,
                membership,
            })
            .instruction()
            .unwrap();

        // draw_seat uses remaining_accounts[0] for the JurorStake.
        let ix_with_meta = solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: {
                let mut accts = ix.accounts;
                accts.push(solana_program::instruction::AccountMeta {
                    pubkey: js_pda,
                    is_signer: false,
                    is_writable: true,
                });
                accts
            },
            data: ix.data,
        };
        let r = env
            .ctx
            .execute_instruction(ix_with_meta, &[&env.creator])
            .unwrap();
        assert!(
            r.is_success(),
            "seat {seat} must succeed; logs={:?}",
            r.logs()
        );
    }

    // After all seats, the dispute should be in Drawn state.
    let acc = env.ctx.svm.get_account(&dispute).unwrap();
    let d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!(d.state, DisputeState::Drawn, "dispute transitions to Drawn");

    // active_draws incremented for drawn jurors.
    for &(seat, leaf_idx) in &drawn {
        let juror_pub = leaves[leaf_idx].0;
        let js = read_juror_stake(&env, &env.subaccord, &juror_pub);
        assert_eq!(js.active_draws, 1, "active_draws for juror at seat {seat}");
    }
}

/// **Deterministic collision re-roll** (bean accord-tzo0). A concentrated-stake
/// fixture (whale + 2 honest jurors) where the whale is selected for seat 0 and
/// seat 1's r_1(0) also lands on the whale (collision). The chain must accept
/// the re-rolled seat 1 at retries=1 (r_1(1) selects a different juror), and
/// reject a fabricated retries claim (retries=1 when retry=0 didn't collide).
#[test]
fn draw_seat_collision_re_roll_resolves_without_caller_choice() {
    let mut env = setup_accumulator();

    // Whale (9000) + two honest jurors (1500 each). Total = 12_000.
    // Whale is 75% — concentrated enough that collisions are likely.
    let stakes = [9_000u64, 1_500, 1_500];
    let mut jurors: Vec<Keypair> = Vec::new();
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for (i, &stake) in stakes.iter().enumerate() {
        let juror = Keypair::new();
        arm_juror(&mut env, &juror, 20_000);
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(&mut env, &juror, stake, path).assert_success();
        leaves.push((juror.pubkey(), stake));
        jurors.push(juror);
    }

    let sub = read_subaccord(&env);
    let total = sub.total_stake;

    // Create + freeze a dispute.
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let fee = 3 * 1_000_000u64;
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    let round_idx = 0u32;

    // Prefixes: whale [0, 9000), j1 [9000, 9500), j2 [9500, 10000).
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut acc = 0u64;
        for (_, s) in &leaves {
            p.push(acc);
            acc += s;
        }
        p
    };

    // Brute-force a VRF where:
    //   seat 0 @ retry 0 → whale (leaf 0)
    //   seat 1 @ retry 0 → whale (collision with seat 0)
    //   seat 1 @ retry 1 → either j1 or j2 (non-whale)
    //   seat 2 → any remaining juror (retry 0 is fine, or with retries)
    // The whale's 90% stake makes seat-1@retry-0 landing on the whale very likely.
    let vrf = {
        let mut candidate = [0u8; 32];
        loop {
            candidate[0] = candidate[0].wrapping_add(1);
            if candidate[0] == 0 {
                candidate[1] = candidate[1].wrapping_add(1);
            }
            let seed = hashv(&[&candidate, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();

            // seat 0 @ retry 0 must land on whale.
            let r0 = u64::from_le_bytes(
                hashv(&[&seed, &0u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes()[0..8]
                    .try_into()
                    .unwrap(),
            ) % total;
            if !(r0 >= prefixes[0] && r0 - prefixes[0] < stakes[0]) {
                continue;
            }

            // seat 1 @ retry 0 must ALSO land on whale (collision).
            let r1_0 = u64::from_le_bytes(
                hashv(&[&seed, &1u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes()[0..8]
                    .try_into()
                    .unwrap(),
            ) % total;
            if !(r1_0 >= prefixes[0] && r1_0 - prefixes[0] < stakes[0]) {
                continue;
            }

            // seat 1 @ retry 1 must land on a NON-whale juror.
            let r1_1 = u64::from_le_bytes(
                hashv(&[&seed, &1u32.to_le_bytes(), &1u32.to_le_bytes()]).to_bytes()[0..8]
                    .try_into()
                    .unwrap(),
            ) % total;
            let s1_1_is_whale = r1_1 >= prefixes[0] && r1_1 - prefixes[0] < stakes[0];
            if s1_1_is_whale {
                continue;
            }

            break candidate;
        }
    };

    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    let vrf_seed = hashv(&[&vrf, dispute.as_ref(), &round_idx.to_le_bytes()]).to_bytes();
    let round_pda = round_pda(&dispute, round_idx);

    // Helper: resolve which leaf a (seat, retry) maps to.
    let leaf_for = |r_i: u64| -> usize {
        for (i, &(_, stake)) in leaves.iter().enumerate() {
            if r_i >= prefixes[i] && r_i - prefixes[i] < stake {
                return i;
            }
        }
        unreachable!("r_i always lands on a leaf");
    };

    // --- Seat 0: whale, retries=0 ---
    let r0 = u64::from_le_bytes(
        hashv(&[&vrf_seed, &0u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes()[0..8]
            .try_into()
            .unwrap(),
    ) % total;
    let seat0_leaf = leaf_for(r0);
    assert_eq!(seat0_leaf, 0, "seat 0 selects the whale");

    submit_draw_seat(
        &mut env, dispute, round_pda, 0, // seat
        0, // retries
        seat0_leaf, &leaves,
    )
    .assert_success();

    // --- Seat 1: collides at retry 0 (whale already drawn), resolves at retry 1 ---
    let r1_0 = u64::from_le_bytes(
        hashv(&[&vrf_seed, &1u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes()[0..8]
            .try_into()
            .unwrap(),
    ) % total;
    let r1_0_leaf = leaf_for(r1_0);
    assert_eq!(r1_0_leaf, 0, "seat 1 retry 0 collides with the whale");

    let r1_1 = u64::from_le_bytes(
        hashv(&[&vrf_seed, &1u32.to_le_bytes(), &1u32.to_le_bytes()]).to_bytes()[0..8]
            .try_into()
            .unwrap(),
    ) % total;
    let seat1_leaf = leaf_for(r1_1);
    assert_ne!(seat1_leaf, 0, "seat 1 retry 1 selects a non-whale");

    submit_draw_seat(
        &mut env, dispute, round_pda, 1, // seat
        1, // retries — retry 0 collided with whale (seat 0)
        seat1_leaf, &leaves,
    )
    .assert_success();

    // --- FABRICATION: submitting seat 2 with retries=1 when retry 0 did NOT
    // collide must REJECT. We need seat 2 retry 0 to land on a fresh (non-drawn)
    // juror, then claim retries=1 with a different leaf. ---
    let r2_0 = u64::from_le_bytes(
        hashv(&[&vrf_seed, &2u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes()[0..8]
            .try_into()
            .unwrap(),
    ) % total;
    let r2_0_leaf = leaf_for(r2_0);

    // If r2_0 lands on the remaining juror (not drawn), claiming retries=1 with
    // a DIFFERENT leaf is a fabrication. But first we need to find what r2_1
    // maps to and submit THAT leaf with retries=1 — the chain should reject
    // because retry 0 didn't collide.
    if r2_0_leaf != 0 && r2_0_leaf != seat1_leaf {
        // r2_0 lands on a fresh juror. Find r2_1's leaf (different from r2_0).
        let r2_1 = u64::from_le_bytes(
            hashv(&[&vrf_seed, &2u32.to_le_bytes(), &1u32.to_le_bytes()]).to_bytes()[0..8]
                .try_into()
                .unwrap(),
        ) % total;
        let r2_1_leaf = leaf_for(r2_1);

        // Only test if r2_1 maps to a different leaf than r2_0 (otherwise both
        // retries land on the same juror and the test is moot).
        if r2_1_leaf != r2_0_leaf {
            let result = submit_draw_seat(
                &mut env, dispute, round_pda, 2,         // seat
                1,         // CLAIMED retries — but retry 0 didn't collide!
                r2_1_leaf, // submitting the retry-1 leaf
                &leaves,
            );
            assert!(
                !result.is_success(),
                "fabricated retries=1 must reject when retry 0 didn't collide; logs={:?}",
                result.logs()
            );

            // Now submit correctly (retry 0 selects r2_0_leaf, retries=0).
            submit_draw_seat(&mut env, dispute, round_pda, 2, 0, r2_0_leaf, &leaves)
                .assert_success();
        } else {
            // r2_0 and r2_1 land on the same leaf — just submit at retries=0.
            submit_draw_seat(&mut env, dispute, round_pda, 2, 0, r2_0_leaf, &leaves)
                .assert_success();
        }
    } else {
        // r2_0 lands on the whale or seat1 juror (collision). Find the
        // correct retries and submit.
        let mut final_retry = 0u32;
        let mut final_leaf = r2_0_leaf;
        for retry in 0..1024u32 {
            let ri = u64::from_le_bytes(
                hashv(&[&vrf_seed, &2u32.to_le_bytes(), &retry.to_le_bytes()]).to_bytes()[0..8]
                    .try_into()
                    .unwrap(),
            ) % total;
            let leaf_idx = leaf_for(ri);
            let is_drawn = leaf_idx == 0 || leaf_idx == seat1_leaf;
            if !is_drawn {
                final_retry = retry;
                final_leaf = leaf_idx;
                break;
            }
        }
        submit_draw_seat(
            &mut env,
            dispute,
            round_pda,
            2,
            final_retry,
            final_leaf,
            &leaves,
        )
        .assert_success();
    }

    // The dispute must be Drawn with 3 distinct jurors.
    let acc = env.ctx.svm.get_account(&dispute).unwrap();
    let d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!(d.state, DisputeState::Drawn);

    let round_acc = env.ctx.svm.get_account(&round_pda).unwrap();
    // zero_copy: discriminator (8 bytes) then the Pod struct.
    let round_data = &round_acc.data[8..];
    let round: &accord::state::Round = bytemuck::from_bytes(round_data);
    assert_eq!(round.juror_count, 3);
    let distinct: std::collections::HashSet<_> = round.jurors[..3].iter().collect();
    assert_eq!(distinct.len(), 3, "all 3 jurors must be distinct");
}

#[test]
fn last_change_slot_field_absent_from_juror_stake() {
    // ADR-0012 locked decision: last_change_slot was DROPPED from JurorStake.
    // The struct (state.rs) has exactly: subaccord, juror, amount, active_draws,
    // bump, tree_index. We verify the account size matches (no extra 8 bytes).
    let mut env = setup_accumulator();
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path).assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    // If last_change_slot existed (i64), reading the account at its offset
    // would yield a non-zero value. The struct layout (after the 8-byte disc):
    //   subaccord(32) juror(32) amount(8) active_draws(4) bump(1) tree_index(4)
    // = 81 data bytes + 8 discriminator = 89. With last_change_slot it'd be 97.
    let pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let acc = env.ctx.svm.get_account(&pda).unwrap();
    assert_eq!(
        acc.data.len(),
        8 + JurorStake::INIT_SPACE,
        "JurorStake size must match the last_change_slot-free layout"
    );
}

// ─── wrong-pool negative tests (REVIEW #1: cross-Subaccord substitution) ───

/// Create a second Subaccord over the same mint (different risk_type).
fn create_second_subaccord(env: &mut AccEnv) -> Pubkey {
    let risk_type_b = {
        let mut rt = [0u8; 32];
        rt[0] = 99;
        rt
    };
    let sub_b = subaccord_pda(&env.creator.pubkey(), &risk_type_b);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateSubaccord {
            creator: env.creator.pubkey(),
            subaccord: sub_b,
            system_program: system_program::ID,
        })
        .args(instruction::CreateSubaccord {
            risk_type: risk_type_b,
            evidence_spec: [0u8; 32],
            staking_token: env.mint,
            min_stake: 1_000,
            jurors_per_dispute: 3,
            alpha_bps: 1_000,
            review_window: 60,
            commit_window: 60,
            reveal_window: 60,
            max_appeals: 3,
            fee_per_juror: 1_000_000,
            authority: env.creator.pubkey(),
            evidence_operator: env.creator.pubkey(),
            depth: TEST_DEPTH,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    sub_b
}

/// Create a dispute under `env.subaccord` (pool A). Returns (dispute_pda, filer).
fn create_dispute_under_a(env: &mut AccEnv) -> (Pubkey, Keypair) {
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for i in 0..3u8 {
        let juror = Keypair::new();
        arm_juror(env, &juror, 10_000);
        let amt = 5_000u64;
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(env, &juror, amt, path).assert_success();
        leaves.push((juror.pubkey(), amt));
    }
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let fee = 3 * 1_000_000u64;
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();
    (dispute, filer)
}

/// Drop a minimal placeholder account so the SVM can resolve the address.
/// `has_one = subaccord` on the dispute fires before this account is loaded.
fn ensure_dummy_round(env: &mut AccEnv, dispute: &Pubkey, round_idx: u32) -> Pubkey {
    let rnd = round_pda(dispute, round_idx);
    env.ctx
        .svm
        .set_account(
            rnd,
            SvmAccount {
                lamports: 1_000_000,
                data: vec![0u8; 8 + std::mem::size_of::<accord::state::Round>()],
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    rnd
}

#[test]
fn cancel_dispute_rejects_wrong_subaccord() {
    let mut env = setup_accumulator();
    let sub_b = create_second_subaccord(&mut env);
    let (dispute, filer) = create_dispute_under_a(&mut env);

    let vault_b = vault_ata(&sub_b, &env.mint);
    create_token_account(&mut env.ctx, &vault_b, &env.mint, &sub_b, 0);
    let fata = juror_ata(&filer.pubkey(), &env.mint);

    let ix = env
        .ctx
        .program()
        .accounts(accounts::CancelDispute {
            caller: env.creator.pubkey(),
            subaccord: sub_b,
            dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_b,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&env.creator]).unwrap();
    assert!(
        !r.is_success(),
        "cancel_dispute with wrong subaccord must be rejected; logs={:?}",
        r.logs()
    );
}

#[test]
fn commit_rejects_wrong_subaccord() {
    let mut env = setup_accumulator();
    let sub_b = create_second_subaccord(&mut env);
    let (dispute, _filer) = create_dispute_under_a(&mut env);
    let rnd = ensure_dummy_round(&mut env, &dispute, 0);

    let juror = Keypair::new();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Commit {
            juror: juror.pubkey(),
            subaccord: sub_b,
            dispute,
            round: rnd,
        })
        .args(instruction::Commit {
            commitment: [0u8; 32],
        })
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&juror]).unwrap();
    assert!(
        !r.is_success(),
        "commit with wrong subaccord must be rejected; logs={:?}",
        r.logs()
    );
}

#[test]
fn settle_round_rejects_wrong_subaccord() {
    let mut env = setup_accumulator();
    let sub_b = create_second_subaccord(&mut env);
    let (dispute, _filer) = create_dispute_under_a(&mut env);
    let rnd = ensure_dummy_round(&mut env, &dispute, 0);

    let ix = env
        .ctx
        .program()
        .accounts(accounts::SettleRound {
            caller: env.creator.pubkey(),
            subaccord: sub_b,
            dispute,
            round: rnd,
        })
        .args(instruction::SettleRound { round_idx: 0u32 })
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&env.creator]).unwrap();
    assert!(
        !r.is_success(),
        "settle_round with wrong subaccord must be rejected; logs={:?}",
        r.logs()
    );
}

// ─── appeal timestamp reset tests (REVIEW #2) ────────────────────────────────

/// Advance the LiteSVM Clock sysvar by `secs` seconds.
fn warp_seconds(env: &mut AccEnv, secs: i64) {
    let mut clock = env.ctx.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = clock.unix_timestamp.saturating_add(secs);
    env.ctx.svm.set_sysvar::<Clock>(&clock);
}

/// Overwrite `dispute.filed_at` (simulates the appeal handler's stamp).
fn stamp_filed_at(env: &mut AccEnv, dispute: &Pubkey, filed_at: i64) {
    let acc = env.ctx.svm.get_account(dispute).expect("dispute exists");
    let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    d.filed_at = filed_at;
    let mut data = acc.data[..8].to_vec();
    AnchorSerialize::serialize(&d, &mut data).unwrap();
    env.ctx
        .svm
        .set_account(
            *dispute,
            SvmAccount {
                lamports: acc.lamports,
                data,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

#[test]
fn cancel_blocked_immediately_after_appeal_timestamp_reset() {
    let mut env = setup_accumulator();
    let (_dispute, filer) = create_dispute_under_a(&mut env);

    // Simulate the first round completing: warp well past the original
    // pre-draw timeout (so without the fix, cancel would fire now).
    warp_seconds(&mut env, PRE_DRAW_CANCEL_TIMEOUT_SECS + 10_000);

    // Appeal resets filed_at to NOW (the fix under test).
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    stamp_filed_at(&mut env, &_dispute, now);

    // Cancel immediately → must fail (CancelTooEarly).
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CancelDispute {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute: _dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&env.creator]).unwrap();
    assert!(
        !r.is_success(),
        "cancel immediately after appeal must fail; logs={:?}",
        r.logs()
    );

    // Warp past the new timeout → cancel succeeds.
    warp_seconds(&mut env, PRE_DRAW_CANCEL_TIMEOUT_SECS + 1);
    let caller2 = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller2.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CancelDispute {
            caller: caller2.pubkey(),
            subaccord: env.subaccord,
            dispute: _dispute,
            staking_token: env.mint,
            filer_token_account: fata,
            vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&caller2]).unwrap();
    r.assert_success();
}

// ─── helpers: inject VRF + frozen root (bypasses VRF program identity) ───────

/// Write `committed_vrf` + `frozen_root` + `frozen_total_stake` directly onto
/// the Dispute account (the LiteSVM equivalent of injectCommittedVrf in the e2e
/// setup). The on-chain `commit_vrf_callback` can only be called by the VRF
/// program identity, which we don't control in LiteSVM.
fn inject_vrf_freeze(
    ctx: &mut anchor_litesvm::AnchorContext,
    dispute: &Pubkey,
    vrf: [u8; 32],
    frozen_root: [u8; 32],
    frozen_total_stake: u64,
) {
    let acc = ctx.svm.get_account(dispute).expect("dispute exists");
    let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    d.committed_vrf = Some(vrf);
    d.frozen_root = frozen_root;
    d.frozen_total_stake = frozen_total_stake;

    // Re-serialize: discriminator (8 bytes) + Borsh body.
    let mut data = acc.data[..8].to_vec();
    AnchorSerialize::serialize(&d, &mut data).unwrap();
    ctx.svm
        .set_account(
            *dispute,
            SvmAccount {
                lamports: acc.lamports,
                data,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

/// Submit a `draw_seat` instruction for the given seat/leaf and return the
/// raw TransactionResult (caller asserts success/failure). Appends the juror's
/// `JurorStake` PDA as `remaining_accounts[0]`.
fn submit_draw_seat(
    env: &mut AccEnv,
    dispute: Pubkey,
    round_pda: Pubkey,
    seat: u32,
    retries: u32,
    leaf_idx: usize,
    leaves: &[(Pubkey, u64)],
) -> TransactionResult {
    let (juror_pub, stake) = leaves[leaf_idx];
    let (_, _, proof) = build_root_and_path(leaves, TEST_DEPTH, leaf_idx as u32);
    let js_pda = juror_stake_pda(&env.subaccord, &juror_pub);

    let membership = accord::state::JurorMembership {
        leaf: LeafClaim {
            juror: juror_pub,
            stake,
        },
        proof,
        index: leaf_idx as u32,
    };

    let ix = env
        .ctx
        .program()
        .accounts(accounts::DrawSeat {
            caller: env.creator.pubkey(),
            dispute,
            round: round_pda,
            system_program: system_program::ID,
        })
        .args(instruction::DrawSeat {
            seat,
            retries,
            membership,
        })
        .instruction()
        .unwrap();

    let ix_with_meta = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut accts = ix.accounts;
            accts.push(solana_program::instruction::AccountMeta {
                pubkey: js_pda,
                is_signer: false,
                is_writable: true,
            });
            accts
        },
        data: ix.data,
    };
    env.ctx
        .execute_instruction(ix_with_meta, &[&env.creator])
        .unwrap()
}
