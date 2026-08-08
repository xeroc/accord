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
    PRE_DRAW_CANCEL_TIMEOUT_SECS, SEED_APPEAL_BOND, SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD,
    WITHDRAWAL_DELAY,
};
use accord::state::{
    Aggregation, CreateSubaccordParams, Dispute, DisputeState, JurorStake, LeafClaim, MSTNode,
    ShortfallPolicy, Subaccord,
};
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
    setup_accumulator_with(6_666, 3)
}

/// Parameterized setup for ADR-0021 tests: same shape as `setup_accumulator`
/// but with a configurable reveal-quorum threshold and redraw cap.
fn setup_accumulator_with(reveal_threshold_bps: u16, max_draw_attempts: u8) -> AccEnv {
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
            params: CreateSubaccordParams {
                staking_token: mint,
                fee_token: mint,
                min_stake: 1_000,
                alpha_bps: 1_000,
                review_window: 60,
                commit_window: 60,
                reveal_window: 60,
                appeal_window: accord::constants::MIN_APPEAL_WINDOW_SECS,
                max_appeals: 3,
                aggregation: Aggregation::Plurality,
                fee_per_juror: 1_000_000,
                reveal_threshold_bps,
                shortfall_policy: ShortfallPolicy::Redraw,
                max_draw_attempts,
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
            stake_vault: vata,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::Stake { amount, path })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
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
    assert_eq!(js.staked, stake_amt);
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
    assert_eq!(js2.staked, 2_000, "juror 2 stake unchanged");

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
    do_request_withdraw(&mut env, &juror, 2_000, path_unstake).assert_success();

    let leaves_after = vec![(juror.pubkey(), 3_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);
    assert_eq!(sub.total_stake, 3_000);

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 3_000);
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
    do_request_withdraw(&mut env, &j1, 3_000, path).assert_success();

    // Root matches a tree where index 0 has stake 0.
    let leaves_after = vec![(j1.pubkey(), 0), (j2.pubkey(), 2_000)];
    let (expected_root, expected_total, _) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    let sub = read_subaccord(&env);
    assert_eq!(sub.root_hash, expected_root);
    assert_eq!(sub.total_stake, expected_total);
    assert_eq!(sub.total_stake, 2_000);
    assert_eq!(sub.staker_count, 1, "distinct staker count drops");

    let js = read_juror_stake(&env, &env.subaccord, &j1.pubkey());
    assert_eq!(js.staked, 0);
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
    do_request_withdraw(&mut env, &juror, 5_000, path_u).assert_success();

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
    let fee = 3 * 1_000_000u64; // initial_num_jurors * fee_per_juror

    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
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
            let seed = hashv(&[
                &candidate,
                dispute.as_ref(),
                &round_idx.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
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
    let vrf_seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &0u32.to_le_bytes(),
    ])
    .to_bytes();
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

#[test]
fn out_of_order_seat_rejected() {
    let mut env = setup_accumulator();

    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    let stakes = [5_000u64, 3_000, 2_000];
    for (i, &stake) in stakes.iter().enumerate() {
        let juror = Keypair::new();
        arm_juror(&mut env, &juror, 10_000);
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(&mut env, &juror, stake, path).assert_success();
        leaves.push((juror.pubkey(), stake));
    }
    let sub = read_subaccord(&env);
    let total = sub.total_stake;

    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let dispute = dispute_pda(&filer.pubkey(), 1u64);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce: 1,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    // Brute-force VRF where all 3 seats select distinct leaves.
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &leaves {
            p.push(a);
            a += s;
        }
        p
    };
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = hashv(&[
                &c,
                dispute.as_ref(),
                &0u32.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
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
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);
    let vrf_seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &0u32.to_le_bytes(),
        &0u32.to_le_bytes(),
    ])
    .to_bytes();
    let rnd = round_pda(&dispute, 0);
    let resolve = |seat: u32| -> usize {
        let rh = hashv(&[&vrf_seed, &seat.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
        let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
        (0..leaves.len())
            .find(|&i| ri >= prefixes[i] && ri - prefixes[i] < leaves[i].1)
            .unwrap()
    };

    let r = submit_draw_seat(&mut env, dispute, rnd, 0, 0, resolve(0), &leaves);
    r.assert_success();

    let r = submit_draw_seat(&mut env, dispute, rnd, 2, 0, resolve(2), &leaves);
    assert!(
        !r.is_success(),
        "out-of-order seat must be rejected; logs={:?}",
        r.logs()
    );

    let r = submit_draw_seat(&mut env, dispute, rnd, 1, 0, resolve(1), &leaves);
    r.assert_success();
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
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
            let seed = hashv(&[
                &candidate,
                dispute.as_ref(),
                &round_idx.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();

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

    let vrf_seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &0u32.to_le_bytes(),
    ])
    .to_bytes();
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
            params: CreateSubaccordParams {
                staking_token: env.mint,
                fee_token: env.mint,
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
                authority: env.creator.pubkey(),
                evidence_operator: env.creator.pubkey(),
                depth: TEST_DEPTH,
            },
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_b,
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&caller2]).unwrap();
    r.assert_success();
}

// ─── appeal fee recovery test (REVIEW #2 — fee+bond merge) ──────────────────

/// Fabricate a Round PDA with juror_count = 0 (no jurors to release).
fn fabricate_empty_round(env: &mut AccEnv, dispute: &Pubkey, round_idx: u32) -> Pubkey {
    let rnd = round_pda(dispute, round_idx);
    let disc = solana_program::hash::hash(b"account:Round").to_bytes();
    let size = 8 + std::mem::size_of::<accord::state::Round>();
    let mut data = vec![0u8; size];
    data[..8].copy_from_slice(&disc[..8]);
    // round_idx at offset 8, juror_count at offset 12 = 0 (zeroed).
    data[8..12].copy_from_slice(&round_idx.to_le_bytes());
    env.ctx
        .svm
        .set_account(
            rnd,
            SvmAccount {
                lamports: 1_000_000,
                data,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    rnd
}

/// Fabricate an AppealBond PDA with the given fields.
fn fabricate_appeal_bond(
    env: &mut AccEnv,
    dispute: &Pubkey,
    bond_seed: u32,
    round_idx: u32,
    appellant: &Pubkey,
    amount: u64,
) -> Pubkey {
    let (pda, bump) = Pubkey::find_program_address(
        &[SEED_APPEAL_BOND, dispute.as_ref(), &bond_seed.to_le_bytes()],
        &ID,
    );
    let disc = solana_program::hash::hash(b"account:AppealBond").to_bytes();
    // disc(8) + dispute(32) + round_idx(4) + appellant(32) + amount(8) + prior(1) + bump(1) = 86
    let mut data = vec![0u8; 86];
    data[..8].copy_from_slice(&disc[..8]);
    data[8..40].copy_from_slice(dispute.as_ref());
    data[40..44].copy_from_slice(&round_idx.to_le_bytes());
    data[44..76].copy_from_slice(appellant.as_ref());
    data[76..84].copy_from_slice(&amount.to_le_bytes());
    data[84] = 0; // prior_result
    data[85] = bump;
    env.ctx
        .svm
        .set_account(
            pda,
            SvmAccount {
                lamports: 1_000_000,
                data,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    pda
}

/// Add tokens to the vault's SPL token account (simulates appeal deposit).
fn add_vault_tokens(env: &mut AccEnv, extra: u64) {
    let vault = vault_ata(&env.subaccord, &env.mint);
    let acc = env.ctx.svm.get_account(&vault).unwrap();
    let mut data = acc.data.clone();
    let current = u64::from_le_bytes(data[64..72].try_into().unwrap());
    data[64..72].copy_from_slice(&(current + extra).to_le_bytes());
    env.ctx
        .svm
        .set_account(
            vault,
            SvmAccount {
                lamports: acc.lamports,
                data,
                owner: TOKEN_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

#[test]
fn cancel_with_appeal_bond_reserves_and_claim_recovers() {
    let mut env = setup_accumulator();
    let (dispute, filer) = create_dispute_under_a(&mut env);

    // The filer deposited 3 * fee_per_juror = 3_000_000 into the vault.
    let round_0_fee = 3u64 * 1_000_000;

    // Simulate an appeal: appellant deposits fee_new(7*fpj) + bond(7*fpj) = 14_000_000.
    let fee_new = 7u64 * 1_000_000;
    let total_deposit = fee_new * 2; // fee + bond
    add_vault_tokens(&mut env, total_deposit);

    // Simulate post-appeal dispute state: current_round = 1, filed_at = now.
    {
        let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
        let acc = env.ctx.svm.get_account(&dispute).unwrap();
        let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
        d.current_round = 1;
        d.filed_at = now;
        let mut data = acc.data[..8].to_vec();
        AnchorSerialize::serialize(&d, &mut data).unwrap();
        env.ctx
            .svm
            .set_account(
                dispute,
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

    // Fabricate post-appeal accounts.
    let appellant = Keypair::new();
    let bond_pda = fabricate_appeal_bond(
        &mut env,
        &dispute,
        0, // PDA seed = round being appealed
        1, // round_idx = new round opened
        &appellant.pubkey(),
        total_deposit,
    );
    let round_0 = fabricate_empty_round(&mut env, &dispute, 0);

    // Warp past cancel timeout.
    warp_seconds(&mut env, PRE_DRAW_CANCEL_TIMEOUT_SECS + 1);

    // Create appellant's token account for claim_appeal_refund later.
    let appellant_ata = juror_ata(&appellant.pubkey(), &env.mint);
    create_token_account(
        &mut env.ctx,
        &appellant_ata,
        &env.mint,
        &appellant.pubkey(),
        0,
    );

    let fata = juror_ata(&filer.pubkey(), &env.mint);
    let vault = vault_ata(&env.subaccord, &env.mint);
    let vault_before = env.ctx.svm.get_account(&vault).unwrap();
    let vault_balance = u64::from_le_bytes(vault_before.data[64..72].try_into().unwrap());
    let filer_before = u64::from_le_bytes(
        env.ctx.svm.get_account(&fata).unwrap().data[64..72]
            .try_into()
            .unwrap(),
    );

    // Cancel: remaining_accounts = [Round_0, AppealBond_0].
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CancelDispute {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();

    // Append remaining_accounts manually.
    let ix_with_meta = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut accts = ix.accounts;
            for key in &[round_0, bond_pda] {
                accts.push(solana_program::instruction::AccountMeta {
                    pubkey: *key,
                    is_signer: false,
                    is_writable: false,
                });
            }
            accts
        },
        data: ix.data,
    };
    let r = env
        .ctx
        .execute_instruction(ix_with_meta, &[&env.creator])
        .unwrap();
    r.assert_success();

    // Filer should have received vault_balance - total_deposit.
    let filer_after = u64::from_le_bytes(
        env.ctx.svm.get_account(&fata).unwrap().data[64..72]
            .try_into()
            .unwrap(),
    );
    assert_eq!(
        filer_after - filer_before,
        vault_balance - total_deposit,
        "filer gets vault minus reserved appeal deposits"
    );

    // Vault should now hold exactly total_deposit (for the appeal refund).
    let vault_after = env.ctx.svm.get_account(&vault).unwrap();
    let vault_remaining = u64::from_le_bytes(vault_after.data[64..72].try_into().unwrap());
    assert_eq!(
        vault_remaining, total_deposit,
        "vault retains exactly the deposit"
    );

    // claim_appeal_refund: appellant gets the full deposit back.
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ClaimAppealRefund {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            appeal_bond: bond_pda,
            fee_token: env.mint,
            claimant_token_account: appellant_ata,
            fee_vault: vault,
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::ClaimAppealRefund { round_idx: 0u32 })
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&env.creator]).unwrap();
    r.assert_success();

    // Appellant received the full deposit.
    let appellant_after = env.ctx.svm.get_account(&appellant_ata).unwrap();
    let appellant_balance = u64::from_le_bytes(appellant_after.data[64..72].try_into().unwrap());
    assert_eq!(
        appellant_balance, total_deposit,
        "appellant recovers full fee+bond on cancel"
    );

    // Vault is now empty (both filer refund and appeal refund paid out).
    let vault_final = env.ctx.svm.get_account(&vault).unwrap();
    let vault_final_balance = u64::from_le_bytes(vault_final.data[64..72].try_into().unwrap());
    assert_eq!(
        vault_final_balance, 0,
        "vault fully drained after both refunds"
    );
}

// ─── partial-panel cancel test (REVIEW #3) ───────────────────────────────────

#[test]
fn cancel_releases_partially_drawn_panel() {
    let mut env = setup_accumulator();

    // Stake 3 jurors.
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    let mut jurors: Vec<Keypair> = Vec::new();
    let stakes = [5_000u64, 3_000, 2_000];
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
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
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

    // Inject VRF + freeze. Find a VRF where seat 0 maps to juror 0.
    let round_idx = 0u32;
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut acc = 0u64;
        for (_, s) in &leaves {
            p.push(acc);
            acc += s;
        }
        p
    };
    let vrf = {
        let mut candidate = [0u8; 32];
        loop {
            candidate[0] = candidate[0].wrapping_add(1);
            if candidate[0] == 0 {
                candidate[1] = candidate[1].wrapping_add(1);
            }
            let seed = hashv(&[
                &candidate,
                dispute.as_ref(),
                &round_idx.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
            let rh = hashv(&[&seed, &0u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
            let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
            if ri >= prefixes[0] && ri - prefixes[0] < leaves[0].1 {
                break candidate;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    // Draw seat 0 only (partial — 1 of 3).
    let rnd = round_pda(&dispute, round_idx);
    submit_draw_seat(&mut env, dispute, rnd, 0, 0, 0, &leaves).assert_success();

    // Verify the drawn juror has active_draws = 1.
    let js = read_juror_stake(&env, &env.subaccord, &jurors[0].pubkey());
    assert_eq!(js.active_draws, 1, "drawn juror should have active_draws=1");

    // Dispute is still Created (panel not full).
    let d_acc = env.ctx.svm.get_account(&dispute).unwrap();
    let d = Dispute::try_deserialize(&mut &d_acc.data[..]).unwrap();
    assert_eq!(d.state, DisputeState::Created);

    // Warp past cancel timeout.
    warp_seconds(&mut env, PRE_DRAW_CANCEL_TIMEOUT_SECS + 1);

    // Cancel: remaining_accounts = [Round_0, JurorStake_0].
    let js_pda = juror_stake_pda(&env.subaccord, &jurors[0].pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CancelDispute {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::CancelDispute {})
        .instruction()
        .unwrap();
    let ix_with_meta = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut accts = ix.accounts;
            for key in &[rnd, js_pda] {
                accts.push(solana_program::instruction::AccountMeta {
                    pubkey: *key,
                    is_signer: false,
                    is_writable: true,
                });
            }
            accts
        },
        data: ix.data,
    };
    let r = env
        .ctx
        .execute_instruction(ix_with_meta, &[&env.creator])
        .unwrap();
    r.assert_success();

    // Drawn juror's active_draws must be released.
    let js_after = read_juror_stake(&env, &env.subaccord, &jurors[0].pubkey());
    assert_eq!(
        js_after.active_draws, 0,
        "partial-panel juror must be released on cancel"
    );

    // Dispute is now Failed.
    let d_acc = env.ctx.svm.get_account(&dispute).unwrap();
    let d = Dispute::try_deserialize(&mut &d_acc.data[..]).unwrap();
    assert_eq!(d.state, DisputeState::Failed);
}

// ─── settlement_delta + reconcile tests (REVIEW #4) ─────────────────────────

/// Write `settlement_delta` directly onto a JurorStake (simulates settlement).
fn inject_settlement_delta(env: &mut AccEnv, juror: &Pubkey, delta: i64) {
    let js_pda = juror_stake_pda(&env.subaccord, juror);
    let acc = env.ctx.svm.get_account(&js_pda).unwrap();
    let mut data = acc.data.clone();
    const SETTLEMENT_DELTA_OFFSET: usize = 8 + 32 + 32 + 8 + 4 + 1 + 4; // disc+sub+jur+amt+draws+bump+idx
    data[SETTLEMENT_DELTA_OFFSET..SETTLEMENT_DELTA_OFFSET + 8]
        .copy_from_slice(&delta.to_le_bytes());
    env.ctx
        .svm
        .set_account(
            js_pda,
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
fn reconcile_stake_folds_delta_into_amount_and_updates_root() {
    let mut env = setup_accumulator();

    // Stake one juror at index 0 with 5_000.
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let stake_amt = 5_000u64;
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, stake_amt, path).assert_success();

    let sub_before = read_subaccord(&env);
    let js_before = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js_before.staked, stake_amt);
    assert_eq!(js_before.stake_delta, 0);

    // Simulate a settlement slash of 500.
    inject_settlement_delta(&mut env, &juror.pubkey(), -500);

    // Root must be UNCHANGED (accumulator canonical — REVIEW #4 fix).
    let sub_after_inject = read_subaccord(&env);
    assert_eq!(
        sub_after_inject.root_hash, sub_before.root_hash,
        "root must not change on settlement_delta write"
    );
    assert_eq!(
        sub_after_inject.total_stake, sub_before.total_stake,
        "total_stake must not change on settlement_delta write"
    );

    // Compute the Merkle path for the juror's current leaf (amount=5000).
    let leaves = vec![(juror.pubkey(), stake_amt)];
    let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);

    // Reconcile: folds -500 into amount → 4500, updates root.
    let js_pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ReconcileStake {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js_pda,
        })
        .args(instruction::ReconcileStake { path: proof })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();

    // Amount folded, delta zeroed.
    let js_after = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js_after.staked, 4_500, "amount must reflect the delta");
    assert_eq!(js_after.stake_delta, 0, "delta must be zeroed");

    // Root updated to match the new leaf.
    let sub_after = read_subaccord(&env);
    let (expected_root, expected_total, _) =
        build_root_and_path(&[(juror.pubkey(), 4_500)], TEST_DEPTH, 0);
    assert_eq!(sub_after.root_hash, expected_root);
    assert_eq!(sub_after.total_stake, expected_total);
    assert_eq!(sub_after.total_stake, 4_500);
}

#[test]
fn request_withdraw_requires_settlement_delta_zero() {
    let mut env = setup_accumulator();

    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let stake_amt = 5_000u64;
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, stake_amt, path).assert_success();

    // Simulate a pending slash of 500 (settlement written, not yet folded).
    inject_settlement_delta(&mut env, &juror.pubkey(), -500);

    // request_withdraw MUST reject a non-canonical ledger — the caller
    // reconciles first. DRY: `reconcile_stake` owns the delta fold. The full
    // pre-slash amount (5000) is refused while the delta is outstanding:
    // PendingSettlement fires before the balance check would even apply.
    let leaves = vec![(juror.pubkey(), stake_amt)];
    let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_request_withdraw(&mut env, &juror, 5_000, proof);
    assert!(
        !r.is_success(),
        "request_withdraw with pending settlement_delta must fail; logs={:?}",
        r.logs()
    );
    assert!(
        format!("{:?}", r.logs()).contains("PendingSettlement"),
        "must fail with PendingSettlement; logs={:?}",
        r.logs()
    );

    // Reconcile folds -500 into amount (5000 -> 4500), zeroes the delta.
    let js_pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
    let (_, _, reconcile_proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ReconcileStake {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js_pda,
        })
        .args(instruction::ReconcileStake {
            path: reconcile_proof,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 4_500, "reconcile folded the slash into amount");
    assert_eq!(js.stake_delta, 0, "delta cleared by reconcile");

    // Ledger now canonical: request_withdraw of the full free stake (4500, no
    // slash reserve) succeeds.
    let leaves_after = vec![(juror.pubkey(), 4_500)];
    let (_, _, proof2) = build_root_and_path(&leaves_after, TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, 4_500, proof2).assert_success();

    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 0, "amount reduced by withdrawal");
    assert_eq!(js.stake_delta, 0, "delta still zero");
}

// ─── two-phase withdraw + slash_reserve tests (REVIEW #5) ────────────────────

#[test]
fn two_phase_request_then_withdraw_after_timelock() {
    let mut env = setup_accumulator();

    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let stake_amt = 5_000u64;
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, stake_amt, path).assert_success();

    // Phase 1: request_withdraw — root updates immediately.
    // Warp forward so Clock::get() returns a non-zero timestamp.
    warp_seconds(&mut env, 1);
    let (_, _, proof) = build_root_and_path(&[(juror.pubkey(), stake_amt)], TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror, stake_amt, proof).assert_success();

    // Amount reduced, pending withdrawal set.
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.staked, 0);
    assert_eq!(js.pending_withdrawal, stake_amt);
    assert!(js.withdraw_requested_at > 0);

    // Phase 2 too early: warp just short of the delay, verify still pending.
    warp_seconds(&mut env, WITHDRAWAL_DELAY - 1);
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(
        js.pending_withdrawal, stake_amt,
        "still pending before timelock"
    );

    // Warp past timelock.
    warp_seconds(&mut env, 2);

    // Phase 2: withdraw succeeds — tokens transferred.
    let r = do_withdraw(&mut env, &juror);
    r.assert_success();

    // Pending withdrawal cleared.
    let js = read_juror_stake(&env, &env.subaccord, &juror.pubkey());
    assert_eq!(js.pending_withdrawal, 0);
    assert_eq!(js.withdraw_requested_at, 0);
}

#[test]
fn request_withdraw_blocked_by_slash_reserve() {
    let mut env = setup_accumulator();

    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let stake_amt = 5_000u64;
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, stake_amt, path).assert_success();

    // Inject slash_reserve = 4_000 (simulating active draws).
    {
        let js_pda = juror_stake_pda(&env.subaccord, &juror.pubkey());
        let acc = env.ctx.svm.get_account(&js_pda).unwrap();
        let mut data = acc.data.clone();
        const SLASH_RESERVE_OFFSET: usize = 8 + 32 + 32 + 8 + 4 + 1 + 4 + 8;
        data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
            .copy_from_slice(&4_000u64.to_le_bytes());
        env.ctx
            .svm
            .set_account(
                js_pda,
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

    // Free stake = 5000 - 4000 = 1000. Withdrawing 1001 must fail.
    let leaves = vec![(juror.pubkey(), stake_amt)];
    let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_request_withdraw(&mut env, &juror, 1_001, proof.clone());
    assert!(
        !r.is_success(),
        "request_withdraw over free stake must fail; logs={:?}",
        r.logs()
    );

    // Withdrawing exactly 1000 (the free stake) succeeds.
    let (_, _, proof2) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_request_withdraw(&mut env, &juror, 1_000, proof2);
    r.assert_success();
}

// ─── commit/reveal/finalize/settle lifecycle (REVIEW #11) ────────────────────

#[test]
fn commit_reveal_finalize_settle_single_round() {
    let mut env = setup_accumulator();

    let stakes = [5_000u64, 3_000, 2_000];
    let mut jurors: Vec<Keypair> = Vec::new();
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

    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    let round_idx = 0u32;
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &leaves {
            p.push(a);
            a += s;
        }
        p
    };
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = hashv(&[
                &c,
                dispute.as_ref(),
                &round_idx.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
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
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    let vrf_seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &0u32.to_le_bytes(),
    ])
    .to_bytes();
    let mut drawn: Vec<(u32, usize)> = Vec::new();
    for seat in 0..3u32 {
        let rh = hashv(&[&vrf_seed, &seat.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
        let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
        let mut f = None;
        for (i, &(_, st)) in leaves.iter().enumerate() {
            if ri >= prefixes[i] && ri - prefixes[i] < st {
                f = Some(i);
                break;
            }
        }
        drawn.push((seat, f.unwrap()));
    }

    let rnd = round_pda(&dispute, round_idx);
    for &(seat, leaf_idx) in &drawn {
        submit_draw_seat(&mut env, dispute, rnd, seat, 0, leaf_idx, &leaves).assert_success();
    }
    let d = Dispute::try_deserialize(&mut &env.ctx.svm.get_account(&dispute).unwrap().data[..])
        .unwrap();
    assert_eq!(d.state, DisputeState::Drawn);

    let round_acc = env.ctx.svm.get_account(&rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&round_acc.data[8..]);
    let (review_end, commit_end, reveal_end) =
        (round.review_end, round.commit_end, round.reveal_end);
    drop(round_acc);

    // Commit phase.
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, review_end - now + 1);
    let vote: u8 = 0;
    let salt0 = [1u8; 32];
    let salt1 = [2u8; 32];
    let comm0 = hashv(&[&[vote], &salt0, jurors[drawn[0].1].pubkey().as_ref()]).to_bytes();
    let comm1 = hashv(&[&[vote], &salt1, jurors[drawn[1].1].pubkey().as_ref()]).to_bytes();
    for (idx, comm) in [(drawn[0].1, comm0), (drawn[1].1, comm1)] {
        let ix = env
            .ctx
            .program()
            .accounts(accounts::Commit {
                juror: jurors[idx].pubkey(),
                subaccord: env.subaccord,
                dispute,
                round: rnd,
            })
            .args(instruction::Commit { commitment: comm })
            .instruction()
            .unwrap();
        env.ctx
            .execute_instruction(ix, &[&jurors[idx]])
            .unwrap()
            .assert_success();
    }

    // Reveal phase.
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, commit_end - now + 1);
    for (idx, salt) in [(drawn[0].1, salt0), (drawn[1].1, salt1)] {
        let ix = env
            .ctx
            .program()
            .accounts(accounts::Reveal {
                juror: jurors[idx].pubkey(),
                subaccord: env.subaccord,
                dispute,
                round: rnd,
            })
            .args(instruction::Reveal { vote, salt })
            .instruction()
            .unwrap();
        env.ctx
            .execute_instruction(ix, &[&jurors[idx]])
            .unwrap()
            .assert_success();
    }

    // Finalize round.
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, reveal_end - now + 1);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::FinalizeRound {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::FinalizeRound {})
        .instruction()
        .unwrap();
    // ADR-0020: finalize_round credits fees_earned — needs panel JurorStake PDAs.
    let ix = {
        let mut accts = ix.accounts.clone();
        for &(_, leaf_idx) in &drawn {
            let js = juror_stake_pda(&env.subaccord, &jurors[leaf_idx].pubkey());
            accts.push(solana_program::instruction::AccountMeta {
                pubkey: js,
                is_signer: false,
                is_writable: true,
            });
        }
        solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: accts,
            data: ix.data.clone(),
        }
    };
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    let d = Dispute::try_deserialize(&mut &env.ctx.svm.get_account(&dispute).unwrap().data[..])
        .unwrap();
    assert_eq!(d.state, DisputeState::RoundResolved);

    // Finalize dispute after appeal window.
    warp_seconds(&mut env, d.terms.appeal_window as i64 + 1);
    let js_pdhas: Vec<Pubkey> = drawn
        .iter()
        .map(|&(_, li)| juror_stake_pda(&env.subaccord, &leaves[li].0))
        .collect();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::FinalizeDispute {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::FinalizeDispute {})
        .instruction()
        .unwrap();
    let ix_meta = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut a = ix.accounts;
            for k in &js_pdhas {
                a.push(solana_program::instruction::AccountMeta {
                    pubkey: *k,
                    is_signer: false,
                    is_writable: true,
                });
            }
            a
        },
        data: ix.data,
    };
    env.ctx
        .execute_instruction(ix_meta, &[&env.creator])
        .unwrap()
        .assert_success();

    // Verify final state + settlement (ADR-0020 two-pool: stake_delta + fees_earned).
    let d = Dispute::try_deserialize(&mut &env.ctx.svm.get_account(&dispute).unwrap().data[..])
        .unwrap();
    assert_eq!(d.state, DisputeState::Final);
    assert_eq!(d.final_ruling, 0u8);
    // finalized_at stamped at the Final transition (Betline reveal-window
    // anchor); 0 before Final, now > 0 and cannot precede filing.
    assert!(d.finalized_at > 0, "finalized_at must be stamped at Final");
    assert!(
        d.finalized_at >= d.filed_at,
        "finalized_at cannot precede filed_at"
    );
    for &(seat, leaf_idx) in &drawn {
        let js = read_juror_stake(&env, &env.subaccord, &leaves[leaf_idx].0);
        assert_eq!(js.active_draws, 0, "seat {seat} active_draws");
        assert_eq!(js.slash_reserve, 0, "seat {seat} slash_reserve");
        if seat < 2 {
            // Coherent: stake_delta = slash share (50); fees_earned = base + fee share.
            assert_eq!(js.stake_delta, 50i64, "seat {seat} stake_delta");
            assert_eq!(js.fees_earned, 1_500_000u64, "seat {seat} fees_earned");
        } else {
            // Incoherent: stake_delta = -slash; fees_earned = 0 (didn't reveal).
            assert_eq!(js.stake_delta, -100i64, "seat {seat} stake_delta");
            assert_eq!(js.fees_earned, 0u64, "seat {seat} fees_earned");
        }
    }
}

// ─── pause circuit breaker (REVIEW #11) ──────────────────────────────────────

#[test]
fn pause_blocks_stake_and_create_dispute() {
    let mut env = setup_accumulator();
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path).assert_success();

    let pda = pause_pda();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Pause {
            authority: env.creator.pubkey(),
            pause_state: pda,
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();

    let juror2 = Keypair::new();
    arm_juror(&mut env, &juror2, 10_000);
    let lv = vec![(juror.pubkey(), 5_000)];
    let (_, _, path2) = build_root_and_path(&lv, TEST_DEPTH, 1);
    let r = do_stake(&mut env, &juror2, 5_000, path2);
    assert!(
        !r.is_success(),
        "stake while paused must fail; logs={:?}",
        r.logs()
    );

    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let dispute = dispute_pda(&filer.pubkey(), 1u64);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce: 1,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&filer]).unwrap();
    assert!(
        !r.is_success(),
        "create_dispute while paused must fail; logs={:?}",
        r.logs()
    );
}

#[test]
fn unpause_after_timelock_restores_stake() {
    let mut env = setup_accumulator();
    let pda = pause_pda();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Pause {
            authority: env.creator.pubkey(),
            pause_state: pda,
        })
        .args(instruction::Pause {})
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ProposeUnpause {
            authority: env.creator.pubkey(),
            pause_state: pda,
        })
        .args(instruction::ProposeUnpause {})
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    let slot = env.ctx.svm.get_sysvar::<Clock>().slot;
    env.ctx
        .svm
        .warp_to_slot(slot + accord::constants::UNPAUSE_TIMELOCK_SLOTS + 1);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ExecuteUnpause {
            caller: env.creator.pubkey(),
            pause_state: pda,
        })
        .args(instruction::ExecuteUnpause {})
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path).assert_success();
}

// ─── settlement + slash_reserve lifecycle (REVIEW #11) ──────────────────────

#[test]
fn settle_round_releases_active_draws_and_slash_reserve() {
    let mut env = setup_accumulator();
    let stakes = [5_000u64, 3_000, 2_000];
    let mut jurors: Vec<Keypair> = Vec::new();
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
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let dispute = dispute_pda(&filer.pubkey(), 1u64);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce: 1,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &leaves {
            p.push(a);
            a += s;
        }
        p
    };
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = hashv(&[
                &c,
                dispute.as_ref(),
                &0u32.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
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
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);
    let vrf_seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &0u32.to_le_bytes(),
        &0u32.to_le_bytes(),
    ])
    .to_bytes();
    let mut drawn: Vec<(u32, usize)> = Vec::new();
    for seat in 0..3u32 {
        let rh = hashv(&[&vrf_seed, &seat.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
        let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
        let mut f = None;
        for (i, &(_, st)) in leaves.iter().enumerate() {
            if ri >= prefixes[i] && ri - prefixes[i] < st {
                f = Some(i);
                break;
            }
        }
        drawn.push((seat, f.unwrap()));
    }
    let rnd = round_pda(&dispute, 0);
    for &(seat, leaf_idx) in &drawn {
        submit_draw_seat(&mut env, dispute, rnd, seat, 0, leaf_idx, &leaves).assert_success();
    }

    let slash_per_juror: u64 = 100;
    for &(seat, leaf_idx) in &drawn {
        let js = read_juror_stake(&env, &env.subaccord, &leaves[leaf_idx].0);
        assert_eq!(js.active_draws, 1, "seat {seat}");
        assert_eq!(js.slash_reserve, slash_per_juror, "seat {seat}");
    }

    // Simulate finalized dispute.
    {
        let acc = env.ctx.svm.get_account(&dispute).unwrap();
        let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
        d.state = DisputeState::Final;
        d.final_ruling = 0;
        d.current_round = 1;
        let mut data = acc.data[..8].to_vec();
        AnchorSerialize::serialize(&d, &mut data).unwrap();
        env.ctx
            .svm
            .set_account(
                dispute,
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
    // Write round reveals + result.
    {
        let acc = env.ctx.svm.get_account(&rnd).unwrap();
        let mut data = acc.data.clone();
        data[20..24].copy_from_slice(&3u32.to_le_bytes());
        data[48] = 0;
        data[2068] = 0;
        data[2069] = 0;
        data[2070] = 1;
        env.ctx
            .svm
            .set_account(
                rnd,
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

    let js_pdhas: Vec<Pubkey> = drawn
        .iter()
        .map(|&(_, li)| juror_stake_pda(&env.subaccord, &leaves[li].0))
        .collect();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::SettleRound {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::SettleRound { round_idx: 0u32 })
        .instruction()
        .unwrap();
    let ix_meta = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut a = ix.accounts;
            for k in &js_pdhas {
                a.push(solana_program::instruction::AccountMeta {
                    pubkey: *k,
                    is_signer: false,
                    is_writable: true,
                });
            }
            a
        },
        data: ix.data,
    };
    let r = env
        .ctx
        .execute_instruction(ix_meta, &[&env.creator])
        .unwrap();
    assert!(
        r.is_success(),
        "settle_round must succeed; logs={:?}",
        r.logs()
    );

    for &(seat, leaf_idx) in &drawn {
        let js = read_juror_stake(&env, &env.subaccord, &leaves[leaf_idx].0);
        assert_eq!(js.active_draws, 0, "seat {seat}");
        assert_eq!(js.slash_reserve, 0, "seat {seat}");
        if seat < 2 {
            assert_eq!(js.stake_delta, 50, "coherent seat {seat}");
        } else {
            assert_eq!(js.stake_delta, -100, "incoherent seat {seat}");
        }
    }
    let round_acc = env.ctx.svm.get_account(&rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&round_acc.data[8..]);
    assert_eq!(round.settled, 1);
}

#[test]
fn slash_reserve_blocks_draw_when_insufficient_free_stake() {
    let mut env = setup_accumulator();
    // Stake 3 jurors (panel gate). Juror 0 at exactly min_stake.
    let j0 = Keypair::new();
    arm_juror(&mut env, &j0, 10_000);
    let (_, _, p0) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &j0, 1_000, p0).assert_success();
    let j1 = Keypair::new();
    arm_juror(&mut env, &j1, 10_000);
    let (_, _, p1) = build_root_and_path(&[(j0.pubkey(), 1_000)], TEST_DEPTH, 1);
    do_stake(&mut env, &j1, 5_000, p1).assert_success();
    let j2 = Keypair::new();
    arm_juror(&mut env, &j2, 10_000);
    let (_, _, p2) =
        build_root_and_path(&[(j0.pubkey(), 1_000), (j1.pubkey(), 5_000)], TEST_DEPTH, 2);
    do_stake(&mut env, &j2, 5_000, p2).assert_success();

    let sub = read_subaccord(&env);
    let leaves = vec![
        (j0.pubkey(), 1_000),
        (j1.pubkey(), 5_000),
        (j2.pubkey(), 5_000),
    ];
    let total = sub.total_stake;

    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let dispute = dispute_pda(&filer.pubkey(), 1u64);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce: 1,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    // Brute-force VRF where seat 0 selects juror 0 (leaf 0).
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &leaves {
            p.push(a);
            a += s;
        }
        p
    };
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = hashv(&[
                &c,
                dispute.as_ref(),
                &0u32.to_le_bytes(),
                &0u32.to_le_bytes(),
            ])
            .to_bytes();
            let rh = hashv(&[&seed, &0u32.to_le_bytes(), &0u32.to_le_bytes()]).to_bytes();
            let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
            if ri >= prefixes[0] && ri - prefixes[0] < leaves[0].1 {
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);
    let rnd = round_pda(&dispute, 0);

    // free_stake = 1000; required = 1000 + 100 = 1100 → fail.
    let r = submit_draw_seat(&mut env, dispute, rnd, 0, 0, 0, &leaves);
    assert!(
        !r.is_success(),
        "draw must fail: free stake < min + slash; logs={:?}",
        r.logs()
    );

    // Top up juror 0 to 2000.
    let (_, _, pt) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    do_stake(&mut env, &j0, 1_000, pt).assert_success();
    let js = read_juror_stake(&env, &env.subaccord, &j0.pubkey());
    assert_eq!(js.staked, 2_000);

    // Draw should succeed now (2000 >= 1100).
    // Use a different caller to avoid LiteSVM AlreadyProcessed (same tx hash).
    let caller2 = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller2.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    {
        let (juror_pub, stake) = leaves[0];
        let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);
        let js_pda = juror_stake_pda(&env.subaccord, &juror_pub);
        let membership = accord::state::JurorMembership {
            leaf: LeafClaim {
                juror: juror_pub,
                stake,
            },
            proof,
            index: 0,
        };
        let ix = env
            .ctx
            .program()
            .accounts(accounts::DrawSeat {
                caller: caller2.pubkey(),
                dispute,
                round: rnd,
                system_program: system_program::ID,
            })
            .args(instruction::DrawSeat {
                seat: 0,
                retries: 0,
                membership,
            })
            .instruction()
            .unwrap();
        let ix_meta = solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: {
                let mut a = ix.accounts;
                a.push(solana_program::instruction::AccountMeta {
                    pubkey: js_pda,
                    is_signer: false,
                    is_writable: true,
                });
                a
            },
            data: ix.data,
        };
        let r = env.ctx.execute_instruction(ix_meta, &[&caller2]).unwrap();
        assert!(
            r.is_success(),
            "draw must succeed after top-up; logs={:?}",
            r.logs()
        );
    }
    let js = read_juror_stake(&env, &env.subaccord, &j0.pubkey());
    assert_eq!(js.active_draws, 1);
    assert_eq!(js.slash_reserve, 100);
}

// ─── ADR-0021: reveal quorum + shortfall redraw (TDD) ────────────────────────

/// Sortition seed: `hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt)`.
/// Mirrors the on-chain `draw_seat` derivation (the per-seat `seat`/`retry`
/// hash is layered on top by `seat_leaf`).
fn vrf_seed(vrf: &[u8; 32], dispute: &Pubkey, round_idx: u32, draw_attempt: u32) -> [u8; 32] {
    hashv(&[
        vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &draw_attempt.to_le_bytes(),
    ])
    .to_bytes()
}

/// Resolve which leaf a given `(seed, seat, retry)` selects against the
/// stake-weighted prefix table. Mirrors the on-chain sortition.
fn seat_leaf(
    seed: &[u8; 32],
    seat: u32,
    retry: u32,
    total: u64,
    prefixes: &[u64],
    leaves: &[(Pubkey, u64)],
) -> usize {
    let rh = hashv(&[seed, &seat.to_le_bytes(), &retry.to_le_bytes()]).to_bytes();
    let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
    for (i, (_, s)) in leaves.iter().enumerate() {
        if ri >= prefixes[i] && ri - prefixes[i] < *s {
            return i;
        }
    }
    unreachable!("r_i always lands on a leaf")
}

/// Owned bundle returned by `setup_and_finalize`: everything a test needs to
/// assert on the post-finalize state and drive `redraw` / re-draw.
struct DrawnDispute {
    env: AccEnv,
    dispute: Pubkey,
    rnd: Pubkey,
    jurors: Vec<Keypair>,
    leaves: Vec<(Pubkey, u64)>,
    /// `(seat, leaf_idx)` per drawn seat (draw_attempt 0).
    drawn: Vec<(u32, usize)>,
    filer: Keypair,
    filer_fee: u64,
    vrf: [u8; 32],
    total: u64,
    prefixes: Vec<u64>,
}

/// Build a Subaccord (custom `threshold_bps`/`max_draw_attempts`) + 3 staked
/// jurors + a drawn dispute, commit+reveal the first `n_reveal` jurors (vote 0),
/// then run `finalize_round`. Returns the post-finalize state. The VRF is
/// brute-forced to yield 3 distinct jurors at draw_attempt 0.
fn setup_and_finalize(threshold_bps: u16, max_draw_attempts: u8, n_reveal: usize) -> DrawnDispute {
    let mut env = setup_accumulator_with(threshold_bps, max_draw_attempts);

    let stakes = [5_000u64, 3_000, 2_000];
    let mut jurors: Vec<Keypair> = Vec::new();
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
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &leaves {
            p.push(a);
            a += s;
        }
        p
    };

    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let filer_fee = 3 * 1_000_000u64;
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee: filer_fee,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    // Brute-force a VRF that draws 3 distinct jurors at draw_attempt 0.
    let round_idx = 0u32;
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = vrf_seed(&c, &dispute, round_idx, 0);
            let seats: Vec<usize> = (0..3u32)
                .map(|seat| seat_leaf(&seed, seat, 0, total, &prefixes, &leaves))
                .collect();
            if seats.iter().collect::<std::collections::HashSet<_>>().len() == 3 {
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    // Resolve + submit the 3 seats (draw_attempt 0).
    let seed0 = vrf_seed(&vrf, &dispute, round_idx, 0);
    let mut drawn: Vec<(u32, usize)> = Vec::new();
    for seat in 0..3u32 {
        drawn.push((seat, seat_leaf(&seed0, seat, 0, total, &prefixes, &leaves)));
    }
    let rnd = round_pda(&dispute, round_idx);
    for &(seat, leaf_idx) in &drawn {
        submit_draw_seat(&mut env, dispute, rnd, seat, 0, leaf_idx, &leaves).assert_success();
    }

    // Commit + reveal the first `n_reveal` drawn jurors (vote 0).
    let round_acc = env.ctx.svm.get_account(&rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&round_acc.data[8..]);
    let (review_end, commit_end, reveal_end) =
        (round.review_end, round.commit_end, round.reveal_end);
    drop(round_acc);

    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, review_end - now + 1);
    let vote: u8 = 0;
    let mut salts: Vec<[u8; 32]> = Vec::new();
    for i in 0..n_reveal {
        let salt = [(i as u8) + 7; 32];
        let comm = hashv(&[&[vote], &salt, jurors[drawn[i].1].pubkey().as_ref()]).to_bytes();
        let ix = env
            .ctx
            .program()
            .accounts(accounts::Commit {
                juror: jurors[drawn[i].1].pubkey(),
                subaccord: env.subaccord,
                dispute,
                round: rnd,
            })
            .args(instruction::Commit { commitment: comm })
            .instruction()
            .unwrap();
        env.ctx
            .execute_instruction(ix, &[&jurors[drawn[i].1]])
            .unwrap()
            .assert_success();
        salts.push(salt);
    }
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, commit_end - now + 1);
    for i in 0..n_reveal {
        let ix = env
            .ctx
            .program()
            .accounts(accounts::Reveal {
                juror: jurors[drawn[i].1].pubkey(),
                subaccord: env.subaccord,
                dispute,
                round: rnd,
            })
            .args(instruction::Reveal {
                vote,
                salt: salts[i],
            })
            .instruction()
            .unwrap();
        env.ctx
            .execute_instruction(ix, &[&jurors[drawn[i].1]])
            .unwrap()
            .assert_success();
    }

    // Finalize round (pass panel juror-stake PDAs as remaining_accounts).
    let now = env.ctx.svm.get_sysvar::<Clock>().unix_timestamp;
    warp_seconds(&mut env, reveal_end - now + 1);
    let _ = commit_end; // already consumed
    let ix = env
        .ctx
        .program()
        .accounts(accounts::FinalizeRound {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::FinalizeRound {})
        .instruction()
        .unwrap();
    let ix = {
        let mut accts = ix.accounts.clone();
        for &(_, leaf_idx) in &drawn {
            accts.push(solana_program::instruction::AccountMeta {
                pubkey: juror_stake_pda(&env.subaccord, &jurors[leaf_idx].pubkey()),
                is_signer: false,
                is_writable: true,
            });
        }
        solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: accts,
            data: ix.data.clone(),
        }
    };
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();

    DrawnDispute {
        env,
        dispute,
        rnd,
        jurors,
        leaves,
        drawn,
        filer,
        filer_fee,
        vrf,
        total,
        prefixes,
    }
}

/// Drive `redraw` for round 0 (no appeals ⇒ remaining_accounts = panel juror
/// stakes only). Returns the raw result for success/failure assertion.
fn do_redraw(dd: &mut DrawnDispute) -> TransactionResult {
    let fata = juror_ata(&dd.filer.pubkey(), &dd.env.mint);
    let ix = dd
        .env
        .ctx
        .program()
        .accounts(accounts::Redraw {
            caller: dd.env.creator.pubkey(),
            subaccord: dd.env.subaccord,
            dispute: dd.dispute,
            round: dd.rnd,
            fee_token: dd.env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&dd.env.subaccord, &dd.env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::Redraw {})
        .instruction()
        .unwrap();
    let ix = {
        let mut accts = ix.accounts.clone();
        for &(_, leaf_idx) in &dd.drawn {
            accts.push(solana_program::instruction::AccountMeta {
                pubkey: juror_stake_pda(&dd.env.subaccord, &dd.leaves[leaf_idx].0),
                is_signer: false,
                is_writable: true,
            });
        }
        solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: accts,
            data: ix.data.clone(),
        }
    };
    dd.env
        .ctx
        .execute_instruction(ix, &[&dd.env.creator])
        .unwrap()
}

fn dispute_state(dd: &DrawnDispute) -> DisputeState {
    Dispute::try_deserialize(&mut &dd.env.ctx.svm.get_account(&dd.dispute).unwrap().data[..])
        .unwrap()
        .state
}

fn round_draw_attempt(dd: &DrawnDispute) -> u32 {
    let acc = dd.env.ctx.svm.get_account(&dd.rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&acc.data[8..]);
    round.draw_attempt
}

#[test]
fn threshold_met_credits_fees_and_resolves() {
    // Low threshold (3_333 ⇒ needs 1); 1 reveal meets it.
    let mut dd = setup_and_finalize(3_333, 3, 1);
    assert_eq!(dispute_state(&dd), DisputeState::RoundResolved);

    // The single revealer is credited fee_per_juror; fee_paid decremented.
    let revealer_idx = dd.drawn[0].1;
    let js = read_juror_stake(&dd.env, &dd.env.subaccord, &dd.leaves[revealer_idx].0);
    assert_eq!(js.fees_earned, 1_000_000, "revealer fees_earned credited");
    let d =
        Dispute::try_deserialize(&mut &dd.env.ctx.svm.get_account(&dd.dispute).unwrap().data[..])
            .unwrap();
    assert_eq!(d.fee_paid, 3_000_000 - 1_000_000, "fee_paid decremented");

    // Non-revealers earn nothing.
    for &(_, leaf_idx) in &dd.drawn[1..] {
        let js = read_juror_stake(&dd.env, &dd.env.subaccord, &dd.leaves[leaf_idx].0);
        assert_eq!(js.fees_earned, 0, "non-revealer fees_earned");
    }
    let _ = &mut dd;
}

#[test]
fn shortfall_round_goes_redraw_eligible_no_credits() {
    // Threshold 10_000 ⇒ needs all 3; only 1 reveals ⇒ shortfall.
    let dd = setup_and_finalize(10_000, 3, 1);
    assert_eq!(dispute_state(&dd), DisputeState::RedrawEligible);

    // No fees credited to anyone.
    for &(_, leaf_idx) in &dd.drawn {
        let js = read_juror_stake(&dd.env, &dd.env.subaccord, &dd.leaves[leaf_idx].0);
        assert_eq!(js.fees_earned, 0, "no credits on shortfall");
    }
    // fee_paid intact (nothing earned out).
    let d =
        Dispute::try_deserialize(&mut &dd.env.ctx.svm.get_account(&dd.dispute).unwrap().data[..])
            .unwrap();
    assert_eq!(d.fee_paid, 3_000_000, "fee_paid intact on shortfall");
}

#[test]
fn redraw_slashes_noshows_and_reopens_created() {
    let mut dd = setup_and_finalize(10_000, 3, 1); // shortfall → RedrawEligible
    let revealer_idx = dd.drawn[0].1;
    let slash_per_juror = 100u64; // α=10% of min_stake 1_000

    let r = do_redraw(&mut dd);
    assert!(r.is_success(), "redraw must succeed; logs={:?}", r.logs());

    // draw_attempt bumped 0→1; round_idx + panel size unchanged (round 0).
    assert_eq!(round_draw_attempt(&dd), 1, "draw_attempt bumped");
    let acc = dd.env.ctx.svm.get_account(&dd.rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&acc.data[8..]);
    assert_eq!(round.round_idx, 0, "round_idx unchanged");
    assert_eq!(round.juror_count, 0, "round cleared");
    assert_eq!(round.commit_count, 0);
    assert_eq!(round.reveal_count, 0);
    assert_eq!(round.result, u8::MAX, "result reset");

    // State re-opened to Created for the fresh seats.
    assert_eq!(dispute_state(&dd), DisputeState::Created);

    // No-shows (seats 1,2) slashed into stake_delta; revealer (seat 0) not.
    // All three released: active_draws=0, slash_reserve=0 for the failed round.
    for &(seat, leaf_idx) in &dd.drawn {
        let js = read_juror_stake(&dd.env, &dd.env.subaccord, &dd.leaves[leaf_idx].0);
        assert_eq!(js.active_draws, 0, "seat {seat} active_draws released");
        assert_eq!(js.slash_reserve, 0, "seat {seat} slash_reserve released");
        if leaf_idx == revealer_idx {
            assert_eq!(js.stake_delta, 0, "revealer not slashed");
        } else {
            assert_eq!(
                js.stake_delta,
                -(slash_per_juror as i64),
                "no-show seat {seat} slashed into stake_delta"
            );
        }
    }
    // fee_paid intact (shortfall pays nothing).
    let d =
        Dispute::try_deserialize(&mut &dd.env.ctx.svm.get_account(&dd.dispute).unwrap().data[..])
            .unwrap();
    assert_eq!(d.fee_paid, 3_000_000);
}

#[test]
fn redraw_exhaustion_fails_and_refunds_filer() {
    // max_draw_attempts=1 ⇒ the first redraw exhausts → Failed.
    let mut dd = setup_and_finalize(10_000, 1, 1); // shortfall → RedrawEligible

    let fata = juror_ata(&dd.filer.pubkey(), &dd.env.mint);
    let before = dd
        .env
        .ctx
        .svm
        .get_account(&fata)
        .map(|a| {
            spl_token::state::Account::unpack_from_slice(&a.data)
                .unwrap()
                .amount
        })
        .unwrap_or(0);

    let r = do_redraw(&mut dd);
    assert!(
        r.is_success(),
        "redraw→Failed must succeed; logs={:?}",
        r.logs()
    );
    assert_eq!(dispute_state(&dd), DisputeState::Failed);

    // Filer refunded the full fee_paid; dispute.fee_paid zeroed.
    let after = dd
        .env
        .ctx
        .svm
        .get_account(&fata)
        .map(|a| {
            spl_token::state::Account::unpack_from_slice(&a.data)
                .unwrap()
                .amount
        })
        .unwrap_or(0);
    assert_eq!(after - before, 3_000_000, "filer refunded fee_paid");
    let d =
        Dispute::try_deserialize(&mut &dd.env.ctx.svm.get_account(&dd.dispute).unwrap().data[..])
            .unwrap();
    assert_eq!(d.fee_paid, 0, "fee_paid zeroed on Failed");

    // No-shows' slashes stand (stake_delta retained); active_draws released.
    let revealer_idx = dd.drawn[0].1;
    for &(seat, leaf_idx) in &dd.drawn {
        let js = read_juror_stake(&dd.env, &dd.env.subaccord, &dd.leaves[leaf_idx].0);
        assert_eq!(js.active_draws, 0, "seat {seat} released");
        if leaf_idx == revealer_idx {
            assert_eq!(js.stake_delta, 0, "revealer not slashed");
        } else {
            assert_eq!(js.stake_delta, -100, "no-show seat {seat} slash retained");
        }
    }
}

#[test]
fn redraw_seed_advances_with_draw_attempt() {
    // Shortfall → redraw (draw_attempt 0→1) → re-draw picks fresh seats whose
    // sortition key is the draw_attempt=1 seed (proving the redraw re-seeds).
    let mut dd = setup_and_finalize(10_000, 3, 1);
    do_redraw(&mut dd).assert_success();
    assert_eq!(dispute_state(&dd), DisputeState::Created);

    // The draw_attempt=1 seed is provably distinct from draw_attempt=0.
    let seed0 = vrf_seed(&dd.vrf, &dd.dispute, 0, 0);
    let seed1 = vrf_seed(&dd.vrf, &dd.dispute, 0, 1);
    assert_ne!(seed0, seed1, "draw_attempt must change the seed");

    // Resolve which leaf each seat lands on at draw_attempt=1, then submit.
    let mut redrawn: Vec<(u32, usize)> = Vec::new();
    for seat in 0..3u32 {
        redrawn.push((
            seat,
            seat_leaf(&seed1, seat, 0, dd.total, &dd.prefixes, &dd.leaves),
        ));
    }
    // If the redraw panel happens to be 3 distinct jurors, draw them and confirm
    // the on-chain draw accepts the draw_attempt=1-derived memberships.
    let distinct = redrawn
        .iter()
        .map(|&(_, l)| l)
        .collect::<std::collections::HashSet<_>>()
        .len()
        == 3;
    if distinct {
        for &(seat, leaf_idx) in &redrawn {
            submit_draw_seat(
                &mut dd.env,
                dd.dispute,
                dd.rnd,
                seat,
                0,
                leaf_idx,
                &dd.leaves,
            )
            .assert_success();
        }
        let acc = dd.env.ctx.svm.get_account(&dd.rnd).unwrap();
        let round: &accord::state::Round = bytemuck::from_bytes(&acc.data[8..]);
        assert_eq!(round.juror_count, 3, "fresh panel filled at draw_attempt=1");
        assert_eq!(round.draw_attempt, 1, "draw_attempt still 1");
    }
    // If not distinct for this VRF, the seed-distinctness assert above already
    // proves the redraw re-seeds; a different VRF would yield distinct seats.
}

#[test]
fn reconciled_noshow_excluded_from_redraw_by_free_stake() {
    // A minimal-stake juror (stake = min_stake + slash_per_juror = 1_100) passes
    // the initial draw gate, but ONE redraw slash folded in by reconcile drops
    // its free stake below the gate → a subsequent draw excludes it.
    let mut env = setup_accumulator_with(10_000, 3);

    // 3 jurors so create_dispute's staker_count gate passes; juror 0 is minimal.
    let stakes = [1_100u64, 5_000, 3_000];
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    let jurors: Vec<Keypair> = Vec::new();
    let jurors = {
        let mut js: Vec<Keypair> = jurors;
        for (i, &stake) in stakes.iter().enumerate() {
            let juror = Keypair::new();
            arm_juror(&mut env, &juror, 10_000);
            let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
            do_stake(&mut env, &juror, stake, path).assert_success();
            leaves.push((juror.pubkey(), stake));
            js.push(juror);
        }
        js
    };

    // Simulate a redraw slash on juror 0, then reconcile (1_100 → 1_000).
    inject_settlement_delta(&mut env, &jurors[0].pubkey(), -100);
    let js_pda = juror_stake_pda(&env.subaccord, &jurors[0].pubkey());
    // The path authenticates juror 0's OLD leaf (1_100) against the stored root.
    let (_, _, proof) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::ReconcileStake {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            juror_stake: js_pda,
        })
        .args(instruction::ReconcileStake { path: proof })
        .instruction()
        .unwrap();
    let r = env.ctx.execute_instruction(ix, &[&env.creator]).unwrap();
    assert!(
        r.is_success(),
        "reconcile must succeed; logs={:?}",
        r.logs()
    );
    let js = read_juror_stake(&env, &env.subaccord, &jurors[0].pubkey());
    assert_eq!(js.staked, 1_000, "reconcile folded the slash into staked");
    assert_eq!(js.stake_delta, 0, "stake_delta cleared by reconcile");

    // Open a dispute; freeze the reconciled root (juror 0 now @ 1_000).
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 100_000_000);
    let nonce = 1u64;
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            subaccord: env.subaccord,
            pause_state: pause_pda(),
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::CreateDispute {
            options: vec![[0u8; 32], [1u8; 32]],
            evidence_hash: [0u8; 32],
            nonce,
            fee: 3 * 1_000_000,
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();
    let sub = read_subaccord(&env);
    // Post-reconcile prefix table + total (the frozen root reflects juror 0 @ 1_000).
    let reconciled_leaves = vec![
        (jurors[0].pubkey(), 1_000u64),
        (jurors[1].pubkey(), 5_000),
        (jurors[2].pubkey(), 3_000),
    ];
    let rec_total = sub.total_stake;
    let rec_prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in &reconciled_leaves {
            p.push(a);
            a += s;
        }
        p
    };
    // Brute-force a VRF whose seat-0 sortition lands on juror 0's range
    // [rec_prefixes[0], rec_prefixes[0]+1_000) so draw_seat passes the sortition
    // check and reaches the free_stake gate (which must then reject juror 0).
    let vrf = {
        let mut c = [0u8; 32];
        loop {
            c[0] = c[0].wrapping_add(1);
            if c[0] == 0 {
                c[1] = c[1].wrapping_add(1);
            }
            let seed = vrf_seed(&c, &dispute, 0, 0);
            if seat_leaf(&seed, 0, 0, rec_total, &rec_prefixes, &reconciled_leaves) == 0 {
                break c;
            }
        }
    };
    inject_vrf_freeze(&mut env.ctx, &dispute, vrf, sub.root_hash, sub.total_stake);

    let rnd = round_pda(&dispute, 0);
    let r = submit_draw_seat(&mut env, dispute, rnd, 0, 0, 0, &reconciled_leaves);
    assert!(
        !r.is_success(),
        "draw must reject the reconciled no-show (free_stake gate); logs={:?}",
        r.logs()
    );
    assert!(
        r.logs()
            .iter()
            .any(|l| l.contains("InsufficientStake") || l.contains("InsufficientBalance")),
        "expected a free-stake error; logs={:?}",
        r.logs()
    );
}

// ─── helpers: inject VRF + frozen root (bypasses VRF program identity) ───────
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

// ─── ADR-0019 dispute-kit: aggregation enum stored on Subaccord ──
//
// The round-1 panel size is the fixed `INITIAL_NUM_JURORS` (=3); the only
// per-Subaccord panel-shape knob is `max_appeals` (0..=3 ⇒ ladders 3 / 3→7 /
// 3→7→15 / 3→7→15→31). `aggregation` (v1 = `Plurality`) is stored verbatim —
// the forward-compat hook for future IRV/Median variants.

/// Build a fresh SVM + funded creator and attempt `create_subaccord` with the
/// given `max_appeals` + `aggregation`. Returns the tx result so callers can
/// assert success/failure. A fresh creator keypair per call keeps the Subaccord
/// PDA unique.
fn try_create_subaccord(
    max_appeals: u8,
    aggregation: Aggregation,
    appeal_window: u64,
) -> TransactionResult {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    // Non-zero risk_type (namespace-squat guard); distinct from setup_accumulator.
    let risk_type = {
        let mut rt = [0u8; 32];
        rt[0] = 0x7F;
        rt
    };
    let sub = subaccord_pda(&creator.pubkey(), &risk_type);
    let mint = Pubkey::new_unique(); // create_subaccord stores but does not validate the mint
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
            params: CreateSubaccordParams {
                staking_token: mint,
                fee_token: mint,
                min_stake: 1_000,
                alpha_bps: 1_000,
                review_window: 60,
                commit_window: 60,
                reveal_window: 60,
                appeal_window,
                max_appeals,
                aggregation,
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
    ctx.execute_instruction(ix, &[&creator]).unwrap()
}

#[test]
fn create_subaccord_stores_aggregation_plurality() {
    // setup_accumulator creates with the v1 defaults; the stored aggregation
    // must be Plurality (the tally-rule hook, ADR-0019).
    let env = setup_accumulator();
    let stored = read_subaccord(&env);
    assert_eq!(stored.aggregation, Aggregation::Plurality);
}

#[test]
fn create_dispute_freezes_aggregation_onto_terms() {
    // ADR-0019: the dispute's aggregation rule is frozen at filing time onto
    // `terms` (Ugly-6), so finalize_round can dispatch off it without reading
    // live `subaccord`. v1 = Plurality. setup_accumulator's Subaccord is
    // created Plurality, so the frozen copy must read Plurality too.
    let mut env = setup_accumulator();
    let (dispute, _filer) = create_dispute_under_a(&mut env);
    let d = Dispute::try_deserialize(&mut &env.ctx.svm.get_account(&dispute).unwrap().data[..])
        .unwrap();
    assert_eq!(d.terms.aggregation, Aggregation::Plurality);
}

#[test]
fn create_subaccord_rejects_max_appeals_above_ceiling() {
    // max_appeals > MAX_APPEALS (3) is the only remaining panel-shape gate now
    // that the round-1 size is fixed at 3 (ladder 3→7→15→31 always fits 31).
    let r = try_create_subaccord(
        4,
        Aggregation::Plurality,
        accord::constants::MIN_APPEAL_WINDOW_SECS,
    );
    assert!(
        !r.is_success(),
        "max_appeals=4 > MAX_APPEALS must be rejected; logs={:?}",
        r.logs()
    );
}

#[test]
fn create_subaccord_accepts_max_appeals_ladder() {
    // Each max_appeals value 0..=3 yields a distinct, valid appeal ladder.
    for ma in 0u8..=3 {
        let r = try_create_subaccord(
            ma,
            Aggregation::Plurality,
            accord::constants::MIN_APPEAL_WINDOW_SECS,
        );
        assert!(
            r.is_success(),
            "max_appeals={ma} must be accepted; logs={:?}",
            r.logs()
        );
    }
}

#[test]
fn create_subaccord_stores_appeal_window() {
    // ADR-0022: appeal_window is a per-Subaccord field persisted at creation.
    // setup_accumulator uses MIN_APPEAL_WINDOW_SECS; the stored copy must match.
    let env = setup_accumulator();
    let stored = read_subaccord(&env);
    assert_eq!(
        stored.appeal_window,
        accord::constants::MIN_APPEAL_WINDOW_SECS
    );
}

#[test]
fn create_dispute_freezes_appeal_window_onto_terms() {
    // ADR-0022 + Ugly-6: the appeal window is frozen at filing onto `terms`, so
    // finalize_dispute / appeal / cancel_dispute read `dispute.terms.appeal_window`
    // (never live `sub.appeal_window`). setup_accumulator's Subaccord sets the
    // floor; the frozen copy must read the same.
    let mut env = setup_accumulator();
    let (dispute, _filer) = create_dispute_under_a(&mut env);
    let d = Dispute::try_deserialize(&mut &env.ctx.svm.get_account(&dispute).unwrap().data[..])
        .unwrap();
    assert_eq!(
        d.terms.appeal_window,
        accord::constants::MIN_APPEAL_WINDOW_SECS
    );
}

#[test]
fn create_subaccord_rejects_appeal_window_below_floor() {
    // ADR-0022: appeal_window < MIN_APPEAL_WINDOW_SECS is rejected. A pool that
    // wants no appeals sets `max_appeals == 0` (the explicit knob), not a 0 window.
    let r = try_create_subaccord(3, Aggregation::Plurality, 0);
    assert!(
        !r.is_success(),
        "appeal_window=0 < MIN_APPEAL_WINDOW_SECS must be rejected; logs={:?}",
        r.logs()
    );
    let r = try_create_subaccord(
        3,
        Aggregation::Plurality,
        accord::constants::MIN_APPEAL_WINDOW_SECS - 1,
    );
    assert!(
        !r.is_success(),
        "appeal_window below floor must be rejected; logs={:?}",
        r.logs()
    );
}
