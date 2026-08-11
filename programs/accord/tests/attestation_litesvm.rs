#![cfg(feature = "no-entrypoint")]
//! Attestation-gated Subaccords (PROG-ATTESTTION). LiteSVM exercises the
//! optional credential gate end-to-end against the compiled `.so`:
//!
//! - `create_subaccord` both-or-neither binding (`AttestationBindingPartial`)
//! - stake gate: valid attestation passes; missing / wrong-credential /
//!   wrong-wallet / expiring-soon each revert; never-expiry (`expiry == 0`)
//!   passes
//! - back-compat: a stake-only Subaccord (both fields `default()`) ignores the
//!   gate entirely — today's behaviour unchanged
//! - `prune_juror`: evicts an expired juror (weight zeroed, `pending_withdrawal`
//!   banked); rejects a still-valid credential (`AttestationNotExpired`); is
//!   meaningless on a stake-only Subaccord (`AttestationMissing`)
//!
//! The SAS attestation account is fabricated in the SVM with the real SAS
//! program as owner and the confirmed variable-length layout (see
//! `sas_layout` in lib.rs). Run via `make test_unit`.

use accord::constants::{SEED_JUROR_STAKE, SEED_PAUSE, SEED_SUBACCORD, WITHDRAWAL_DELAY};
use accord::state::{
    Aggregation, CreateSubaccordParams, JurorStake, MSTNode, ShortfallPolicy, Subaccord,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize};
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use solana_program::{instruction::AccountMeta, pubkey::Pubkey};
use solana_sdk::{
    account::Account as SvmAccount, native_token::LAMPORTS_PER_SOL, signature::Keypair,
    signer::Signer, sysvar::clock::Clock,
};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token::solana_program::{program_option::COption, program_pack::Pack};
use spl_token::state::{Account as SplTokenAccount, AccountState, Mint as SplMint};
use spl_token::ID as TOKEN_PROGRAM_ID;
use std::path::PathBuf;

// --- SAS layout constants (mirror `sas_layout` in lib.rs) ---
const SAS_PROGRAM_ID: Pubkey =
    Pubkey::from_str_const("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG");
const SAS_DISC: u8 = 2;
const SAS_CREDENTIAL_OFF: usize = 33;
const SAS_SCHEMA_OFF: usize = 65;
const SAS_DATA_LEN_OFF: usize = 97;
const SAS_DATA_OFF: usize = 101;
const SAS_WALLET_W: usize = 32;
const SAS_SIGNER_W: usize = 32;
const SAS_EXPIRY_W: usize = 8;

const SPL_RENT: u64 = 1_000_000_000;
const TEST_DEPTH: u8 = 4;

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

// ─── MST helpers (must match lib.rs mst_leaf_hash / mst_node_hash) ──────────

fn mst_leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}

fn mst_node_hash(lh: &[u8; 32], ls: u64, rh: &[u8; 32], rs: u64) -> [u8; 32] {
    use solana_program::hash::hashv;
    hashv(&[lh, &ls.to_le_bytes(), rh, &rs.to_le_bytes()]).to_bytes()
}

fn empty_tree_root(depth: u8) -> [u8; 32] {
    let mut h = mst_leaf_hash(&Pubkey::default(), 0);
    for _ in 0..depth {
        h = mst_node_hash(&h, 0, &h, 0);
    }
    h
}

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

// ─── SPL fabrication ────────────────────────────────────────────────────────

fn create_mint(ctx: &mut anchor_litesvm::AnchorContext, mint: &Pubkey) {
    let mut buf = [0u8; SplMint::LEN];
    let m = SplMint {
        mint_authority: COption::None,
        supply: 1_000_000_000,
        decimals: 6,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    Pack::pack(m, &mut buf).unwrap();
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

// ─── SAS attestation fabrication ────────────────────────────────────────────

/// Build a raw SAS Attestation account body (data_len = 32 → wallet only) with
/// the confirmed variable-length layout. `expiry == 0` ⇒ never expires.
fn make_sas_attestation(
    credential: &Pubkey,
    schema: &Pubkey,
    wallet: &Pubkey,
    expiry: i64,
) -> Vec<u8> {
    let data_len: u32 = SAS_WALLET_W as u32;
    let total = SAS_DATA_OFF + SAS_WALLET_W + SAS_SIGNER_W + SAS_EXPIRY_W; // 173
    let mut buf = vec![0u8; total];
    buf[0] = SAS_DISC;
    // [1..33] nonce — left zero (the program does not read it).
    buf[SAS_CREDENTIAL_OFF..SAS_CREDENTIAL_OFF + 32].copy_from_slice(credential.as_ref());
    buf[SAS_SCHEMA_OFF..SAS_SCHEMA_OFF + 32].copy_from_slice(schema.as_ref());
    buf[SAS_DATA_LEN_OFF..SAS_DATA_LEN_OFF + 4].copy_from_slice(&data_len.to_le_bytes());
    buf[SAS_DATA_OFF..SAS_DATA_OFF + SAS_WALLET_W].copy_from_slice(wallet.as_ref());
    // [101+32..+32] signer — left zero (program does not read it).
    let expiry_off = SAS_DATA_OFF + SAS_WALLET_W + SAS_SIGNER_W;
    buf[expiry_off..expiry_off + SAS_EXPIRY_W].copy_from_slice(&expiry.to_le_bytes());
    buf
}

/// Install a SAS attestation account at `addr` in the SVM, owned by the SAS
/// program. The juror supplies this address; the program validates by reading
/// (no PDA derivation — SAS nonce is a free seed).
fn set_sas_attestation(
    ctx: &mut anchor_litesvm::AnchorContext,
    addr: &Pubkey,
    credential: &Pubkey,
    schema: &Pubkey,
    wallet: &Pubkey,
    expiry: i64,
) {
    ctx.svm
        .set_account(
            *addr,
            SvmAccount {
                lamports: SPL_RENT,
                data: make_sas_attestation(credential, schema, wallet, expiry),
                owner: SAS_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

/// Overwrite the Clock sysvar unix_timestamp (LiteSVM has no wall clock).
fn set_now(ctx: &mut anchor_litesvm::AnchorContext, ts: i64) {
    let mut clk = ctx.svm.get_sysvar::<Clock>();
    clk.unix_timestamp = ts;
    ctx.svm.set_sysvar(&clk);
}

fn now_of(ctx: &anchor_litesvm::AnchorContext) -> i64 {
    ctx.svm.get_sysvar::<Clock>().unix_timestamp
}

// ─── shared env ─────────────────────────────────────────────────────────────

struct Env {
    ctx: anchor_litesvm::AnchorContext,
    creator: Keypair,
    mint: Pubkey,
    subaccord: Pubkey,
    credential: Pubkey,
    schema: Pubkey,
}

fn default_params() -> CreateSubaccordParams {
    CreateSubaccordParams {
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
        authority: Pubkey::default(),
        evidence_operator: Pubkey::default(),
        depth: TEST_DEPTH,
        juror_credential: Pubkey::default(),
        juror_schema: Pubkey::default(),
    }
}

/// Fresh SVM + pause singleton + mint. `gated` ⇒ a credential-gated Subaccord
/// with a known `(credential, schema)` pair; otherwise stake-only.
fn setup(gated: bool) -> Env {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();

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

    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);

    let risk_type = {
        let mut rt = [0u8; 32];
        rt[0] = 7;
        rt
    };
    let (credential, schema) = if gated {
        (Pubkey::new_unique(), Pubkey::new_unique())
    } else {
        (Pubkey::default(), Pubkey::default())
    };
    let sub = subaccord_pda(&creator.pubkey(), &risk_type);
    let mut params = default_params();
    params.juror_credential = credential;
    params.juror_schema = schema;
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
            params,
        })
        .instruction()
        .unwrap();
    ctx.execute_instruction(ix, &[&creator])
        .unwrap()
        .assert_success();

    Env {
        ctx,
        creator,
        mint,
        subaccord: sub,
        credential,
        schema,
    }
}

fn read_subaccord(env: &Env) -> Subaccord {
    let acc = env.ctx.svm.get_account(&env.subaccord).expect("subaccord");
    Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn read_juror_stake(env: &Env, juror: &Pubkey) -> JurorStake {
    let pda = juror_stake_pda(&env.subaccord, juror);
    let acc = env.ctx.svm.get_account(&pda).expect("juror stake");
    JurorStake::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn arm_juror(env: &mut Env, juror: &Keypair, token_balance: u64) {
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

/// Submit `stake`, optionally appending a SAS attestation account as
/// `remaining_accounts[0]` (read-only).
fn do_stake(
    env: &mut Env,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
    attestation: Option<Pubkey>,
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
    let ix = if let Some(att) = attestation {
        solana_program::instruction::Instruction {
            program_id: ix.program_id,
            accounts: {
                let mut a = ix.accounts;
                a.push(AccountMeta {
                    pubkey: att,
                    is_signer: false,
                    is_writable: false,
                });
                a
            },
            data: ix.data,
        }
    } else {
        ix
    };
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

/// Submit `prune_juror` (permissionless caller) with the expired juror's
/// attestation as `remaining_accounts[0]`.
fn do_prune(
    env: &mut Env,
    juror: &Pubkey,
    attestation: Pubkey,
    path: Vec<MSTNode>,
) -> TransactionResult {
    let caller = Keypair::new();
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    let js = juror_stake_pda(&env.subaccord, juror);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::PruneJuror {
            caller: caller.pubkey(),
            juror: *juror,
            subaccord: env.subaccord,
            juror_stake: js,
            system_program: system_program::ID,
        })
        .args(instruction::PruneJuror { path })
        .instruction()
        .unwrap();
    let ix = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut a = ix.accounts;
            a.push(AccountMeta {
                pubkey: attestation,
                is_signer: false,
                is_writable: false,
            });
            a
        },
        data: ix.data,
    };
    env.ctx.execute_instruction(ix, &[&caller]).unwrap()
}
/// Overwrite the Clock sysvar unix_timestamp (advance wall-clock for timelocks).
fn warp_seconds(env: &mut Env, secs: i64) {
    let mut clock = env.ctx.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = clock.unix_timestamp.saturating_add(secs);
    env.ctx.svm.set_sysvar::<Clock>(&clock);
}

/// `request_withdraw` — phase-1 ledger-only withdraw: zeros the leaf's
/// selection weight, banks `amount` into `pending_withdrawal`, recomputes the
/// root. No token move, no attestation gate.
fn do_request_withdraw(
    env: &mut Env,
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

/// `withdraw` — phase-2 SPL transfer out of the vault (consumes pending_withdrawal).
fn do_withdraw(env: &mut Env, juror: &Keypair) -> TransactionResult {
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

/// `reclaim_slot` — permissionless crank pushing a drained juror's slot onto
/// the free list. `caller` is an arbitrary funded account.
fn do_reclaim_slot(
    env: &mut Env,
    caller: &Keypair,
    juror: &Pubkey,
    path: Vec<MSTNode>,
) -> TransactionResult {
    env.ctx
        .svm
        .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
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

/// `stake` into a gated pool's recycled slot: attestation at
/// `remaining_accounts[0]` (read-only) + the freed JurorStake PDA at `[1]`
/// (writable). Exercises the gated-aware freed-slot index in the handler.
fn do_stake_gated_recycled(
    env: &mut Env,
    juror: &Keypair,
    amount: u64,
    path: Vec<MSTNode>,
    attestation: Pubkey,
    freed_slot: Pubkey,
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
    let ix = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut a = ix.accounts;
            // [0] = SAS attestation (read-only); [1] = freed JurorStake (writable).
            a.push(AccountMeta {
                pubkey: attestation,
                is_signer: false,
                is_writable: false,
            });
            a.push(AccountMeta {
                pubkey: freed_slot,
                is_signer: false,
                is_writable: true,
            });
            a
        },
        data: ix.data,
    };
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

/// Assert a result failed and name the expected error in the logs.
fn assert_failed(r: &TransactionResult, needle: &str) {
    assert!(
        !r.is_success(),
        "expected failure ({needle}); logs={:?}",
        r.logs()
    );
    let joined = r.logs().join("\n");
    assert!(
        joined.contains(needle),
        "expected error `{needle}` in logs; logs={joined}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  create_subaccord: both-or-neither binding
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn create_rejects_half_bound_credential() {
    let mut ctx = AnchorLiteSVM::build_with_program(ID, &load_program());
    let creator = Keypair::new();
    ctx.svm
        .airdrop(&creator.pubkey(), 100 * LAMPORTS_PER_SOL)
        .unwrap();
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
    let mint = Pubkey::new_unique();
    create_mint(&mut ctx, &mint);
    let risk_type = {
        let mut rt = [0u8; 32];
        rt[0] = 9;
        rt
    };
    let sub = subaccord_pda(&creator.pubkey(), &risk_type);
    let mut params = default_params();
    params.juror_credential = Pubkey::new_unique(); // set…
    params.juror_schema = Pubkey::default(); // …but schema unset ⇒ half-bound.
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
            params,
        })
        .instruction()
        .unwrap();
    let r = ctx.execute_instruction(ix, &[&creator]).unwrap();
    assert_failed(&r, "AttestationBindingPartial");
}

#[test]
fn gated_subaccord_stores_credential_binding() {
    let env = setup(true);
    let sub = read_subaccord(&env);
    assert_eq!(sub.juror_credential, env.credential);
    assert_eq!(sub.juror_schema, env.schema);
}

// ═══════════════════════════════════════════════════════════════════════════
//  stake gate
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn gated_stake_accepts_valid_attestation() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    // Never-expiry ⇒ passes the horizon gate trivially.
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        0,
    );
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, Some(att));
    r.assert_success();
    let js = read_juror_stake(&env, &juror.pubkey());
    assert_eq!(js.staked, 5_000);
    assert_eq!(read_subaccord(&env).staker_count, 1);
}

#[test]
fn gated_stake_rejects_missing_attestation() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, None);
    assert_failed(&r, "AttestationMissing");
}

#[test]
fn gated_stake_rejects_wrong_credential() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &Pubkey::new_unique(), // wrong credential
        &env.schema,
        &juror.pubkey(),
        0,
    );
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, Some(att));
    assert_failed(&r, "AttestationMismatch");
}

#[test]
fn gated_stake_rejects_wrong_wallet() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &Pubkey::new_unique(), // attests to a different wallet
        0,
    );
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, Some(att));
    assert_failed(&r, "AttestationSubjectMismatch");
}

#[test]
fn gated_stake_rejects_soon_expiring_attestation() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    // horizon = (60+60+60+3600) × 4 = 15_120; an attestation expiring before
    // now + horizon must be rejected even though it is currently valid.
    let now = now_of(&env.ctx);
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        now + 1_000, // valid now, but lapses within the dispute lifecycle
    );
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, Some(att));
    assert_failed(&r, "AttestationExpired");
}

#[test]
fn gated_stake_accepts_far_future_attestation() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    let now = now_of(&env.ctx);
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        now + 10 * 365 * 24 * 3600, // well past the horizon
    );
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, Some(att));
    r.assert_success();
}

// ═══════════════════════════════════════════════════════════════════════════
//  back-compat: stake-only Subaccord ignores the gate
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn stake_only_subaccord_ignores_attestation_gate() {
    let mut env = setup(false); // both fields default()
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    // No attestation supplied, no credential binding — today's behaviour.
    let (_, _, path) = build_root_and_path(&[], TEST_DEPTH, 0);
    let r = do_stake(&mut env, &juror, 5_000, path, None);
    r.assert_success();
    assert_eq!(read_juror_stake(&env, &juror.pubkey()).staked, 5_000);
    // The stored binding is the default sentinel.
    let sub = read_subaccord(&env);
    assert_eq!(sub.juror_credential, Pubkey::default());
    assert_eq!(sub.juror_schema, Pubkey::default());
}

// ═══════════════════════════════════════════════════════════════════════════
//  prune_juror
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn prune_evicts_expired_juror_from_accumulator() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    // Stake with a far-future expiry (passes the horizon gate).
    let now = now_of(&env.ctx);
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        now + 10 * 365 * 24 * 3600,
    );
    let (_, _, path_stake) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path_stake, Some(att)).assert_success();
    assert_eq!(read_subaccord(&env).staker_count, 1);

    // Warp time past the attestation's expiry so it is now expired.
    let future = now + 20 * 365 * 24 * 3600;
    set_now(&mut env.ctx, future);
    // Rewrite the attestation to a near-past expiry (it expired after staking).
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        future - 1_000, // expired 1000s ago
    );

    // Prune: the full stake leaf → zero weight, banked into pending_withdrawal.
    let leaves = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_prune) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_prune(&mut env, &juror.pubkey(), att, path_prune);
    r.assert_success();

    let js = read_juror_stake(&env, &juror.pubkey());
    assert_eq!(js.staked, 0, "selection weight zeroed");
    assert_eq!(js.pending_withdrawal, 5_000, "full amount banked");
    let sub = read_subaccord(&env);
    assert_eq!(sub.staker_count, 0, "staker_count decremented");
    assert_eq!(sub.total_stake, 0, "accumulator total zeroed");
    // Root matches a tree whose leaf 0 is `(juror, 0)` — zero selection weight
    // but the juror identity is retained (re-stake is a local update, mirroring
    // `request_withdraw`). It is NOT the all-default empty tree.
    let (expected_root, _, _) = build_root_and_path(&[(juror.pubkey(), 0)], TEST_DEPTH, 0);
    assert_eq!(sub.root_hash, expected_root);
}

#[test]
fn prune_rejects_still_valid_credential() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    let now = now_of(&env.ctx);
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        now + 10 * 365 * 24 * 3600,
    );
    let (_, _, path_stake) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path_stake, Some(att)).assert_success();

    // Still valid (never expired) ⇒ prune must refuse.
    let leaves = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_prune) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_prune(&mut env, &juror.pubkey(), att, path_prune);
    assert_failed(&r, "AttestationNotExpired");
    // Stake untouched.
    assert_eq!(read_juror_stake(&env, &juror.pubkey()).staked, 5_000);
}

#[test]
fn prune_rejects_never_expiring_credential() {
    let mut env = setup(true);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let att = Pubkey::new_unique();
    set_sas_attestation(
        &mut env.ctx,
        &att,
        &env.credential,
        &env.schema,
        &juror.pubkey(),
        0, // never expires
    );
    let (_, _, path_stake) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path_stake, Some(att)).assert_success();

    let leaves = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_prune) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let r = do_prune(&mut env, &juror.pubkey(), att, path_prune);
    assert_failed(&r, "AttestationNotExpired");
}

#[test]
fn prune_rejects_stake_only_subaccord() {
    let mut env = setup(false);
    let juror = Keypair::new();
    arm_juror(&mut env, &juror, 10_000);
    let (_, _, path_stake) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror, 5_000, path_stake, None).assert_success();

    let leaves = vec![(juror.pubkey(), 5_000)];
    let (_, _, path_prune) = build_root_and_path(&leaves, TEST_DEPTH, 0);
    let att = Pubkey::new_unique();
    let r = do_prune(&mut env, &juror.pubkey(), att, path_prune);
    assert_failed(&r, "AttestationMissing");
    // Stake untouched.
    assert_eq!(read_juror_stake(&env, &juror.pubkey()).staked, 5_000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  gated pool + recycled slot: attestation and freed-slot coexist
//  (regression for the auto-merge collision where both read remaining_accounts[0])
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn gated_stake_pops_recycled_slot_with_attestation_at_distinct_indices() {
    let mut env = setup(true);
    let now = now_of(&env.ctx);

    // --- Juror A: stake into the gated pool, then fully drain + reclaim. ---
    let juror_a = Keypair::new();
    arm_juror(&mut env, &juror_a, 10_000);
    let att_a = Pubkey::new_unique();
    set_sas_attestation(
        &mut env.ctx,
        &att_a,
        &env.credential,
        &env.schema,
        &juror_a.pubkey(),
        now + 10 * 365 * 24 * 3600,
    );
    let (_, _, path_a) = build_root_and_path(&[], TEST_DEPTH, 0);
    do_stake(&mut env, &juror_a, 5_000, path_a, Some(att_a)).assert_success();
    // tree: [(A, 5000)] @ index 0

    // Drain A: request_withdraw zeros the leaf weight, withdraw moves tokens.
    let (_, _, path_rw) = build_root_and_path(&[(juror_a.pubkey(), 5_000)], TEST_DEPTH, 0);
    do_request_withdraw(&mut env, &juror_a, 5_000, path_rw).assert_success();
    warp_seconds(&mut env, WITHDRAWAL_DELAY + 1);
    do_withdraw(&mut env, &juror_a).assert_success();
    // tree: [(A, 0)] — A fully drained, slot occupied but zero weight.

    // Reclaim A's slot → free-list head = 0, leaf identity blanked to (default, 0).
    let (_, _, path_reclaim) = build_root_and_path(&[(juror_a.pubkey(), 0)], TEST_DEPTH, 0);
    let caller = Keypair::new();
    do_reclaim_slot(&mut env, &caller, &juror_a.pubkey(), path_reclaim).assert_success();
    let sub = read_subaccord(&env);
    assert_eq!(sub.free_head, 0, "recycled slot 0 is now the free-list head");
    // tree: [(default, 0)] — empty again.

    // --- Juror B: stake into the recycled slot on the SAME gated pool. ---
    // This is the collision point: B must pass its attestation AND A's freed
    // JurorStake PDA. Before the gated-aware index fix the handler read the
    // attestation (SAS-owned) at [0] as the freed slot → FreeListHeadMismatch.
    let juror_b = Keypair::new();
    arm_juror(&mut env, &juror_b, 10_000);
    let att_b = Pubkey::new_unique();
    set_sas_attestation(
        &mut env.ctx,
        &att_b,
        &env.credential,
        &env.schema,
        &juror_b.pubkey(),
        now + 10 * 365 * 24 * 3600,
    );
    let freed_slot = juror_stake_pda(&env.subaccord, &juror_a.pubkey());
    let (_, _, path_b) = build_root_and_path(&[(Pubkey::default(), 0)], TEST_DEPTH, 0);
    let r = do_stake_gated_recycled(&mut env, &juror_b, 5_000, path_b, att_b, freed_slot);
    r.assert_success();

    // B inherited the recycled index 0; next_index was NOT bumped (pop, not bump).
    let js_b = read_juror_stake(&env, &juror_b.pubkey());
    assert_eq!(js_b.staked, 5_000);
    assert_eq!(js_b.tree_index, 0, "B reused A's recycled slot");
    assert_eq!(js_b.next_free, u32::MAX);
    let sub = read_subaccord(&env);
    assert_eq!(sub.next_index, 1, "next_index unchanged by a free-list pop");
    assert_eq!(sub.free_head, u32::MAX, "free list drained back to empty");
    assert_eq!(sub.staker_count, 1);
    // A's freed JurorStake account was closed by the pop (lamports drained).
    let freed_after = env.ctx.svm.get_account(&freed_slot);
    assert!(
        freed_after.is_none() || freed_after.unwrap().lamports == 0,
        "freed slot account should be closed (drained)"
    );
}
