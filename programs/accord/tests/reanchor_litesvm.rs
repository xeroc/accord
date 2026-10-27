#![cfg(feature = "no-entrypoint")]
//! ADR-0038: shrink-only re-anchoring of round windows (bean accord-9952).
//!
//! `draw_seat` fixes `review_end`/`commit_end`/`reveal_end` at panel-fill.
//! The early relaxations (reveal opens on all-committed, `finalize_round`
//! resolves on all-revealed) only relax LOWER bounds — an eager panel that
//! finished in seconds still idled out the full scheduled commit+reveal span
//! before the appeal clock even started (devnet repro: Inveigo arena court,
//! 1s/12h/12h/30s windows, N=1 AI juror, ~24h to finality).
//!
//! The fix re-anchors `reveal_end` at the last state change:
//!
//! - panel-full `commit` → `reveal_end = min(reveal_end, now + reveal_window)`
//! - early `finalize_round` (all revealed, `now < reveal_end`) → `reveal_end = now`
//!
//! Every deadline consumer (`appeal`, `finalize_dispute`, `cancel_dispute`)
//! derives from `reveal_end`, so one field re-anchors the appeal window and
//! finality. Invariant: deadlines only ever move EARLIER (shrink-only).
//!
//! Run via `make test_unit`.

use accord::constants::{SEED_APPEAL_BOND, SEED_JUROR_STAKE};
use accord::state::{
    Aggregation, CreateSubaccordParams, Dispute, DisputeState, LeafClaim, MSTNode, ShortfallPolicy,
};
use accord::{accounts, instruction, ID};
use anchor_lang::{system_program, AccountDeserialize, AnchorSerialize};
use anchor_litesvm::{AnchorLiteSVM, TransactionResult};
use solana_account::Account as SvmAccount;
use solana_program::hash::hashv;
use solana_program::pubkey::Pubkey;
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

// Long commit/reveal windows (1h each) so the scheduled `reveal_end` sits far
// in the future and every re-anchoring assertion is unambiguous.
const REVIEW: u64 = 60;
const COMMIT: u64 = 3_600;
const REVEAL: u64 = 3_600;
const APPEAL: u64 = accord::constants::MIN_APPEAL_WINDOW_SECS;
const SPL_RENT: u64 = 1_000_000_000;
const TEST_DEPTH: u8 = 4;
const TEST_FPJ: u64 = 50;

// ─── harness (same shape as accumulator_litesvm.rs) ──────────────────────────

fn mst_leaf_hash(juror: &Pubkey, stake: u64) -> [u8; 32] {
    hashv(&[juror.as_ref(), &stake.to_le_bytes()]).to_bytes()
}

fn mst_node_hash(lh: &[u8; 32], ls: u64, rh: &[u8; 32], rs: u64) -> [u8; 32] {
    hashv(&[lh, &ls.to_le_bytes(), rh, &rs.to_le_bytes()]).to_bytes()
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

fn load_program() -> Vec<u8> {
    let so = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/accord.so");
    std::fs::read(&so)
        .unwrap_or_else(|_| panic!("read {so:?} — run `anchor build` (or cargo build-sbf) first"))
}

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

fn subaccord_pda(creator: &Pubkey, domain_ref: &[u8; 32]) -> Pubkey {
    accord::subaccord_pda(creator, domain_ref).0
}

fn pause_pda() -> Pubkey {
    accord::accord_state_pda().0
}

fn dispute_pda(filer: &Pubkey, nonce: u64) -> Pubkey {
    accord::dispute_pda(filer, nonce).0
}

fn round_pda(dispute: &Pubkey, round_idx: u32) -> Pubkey {
    Pubkey::find_program_address(&[b"round", dispute.as_ref(), &round_idx.to_le_bytes()], &ID).0
}

struct Env {
    ctx: anchor_litesvm::AnchorContext,
    creator: Keypair,
    mint: Pubkey,
    subaccord: Pubkey,
}

/// Fresh SVM + singleton + mint + Subaccord with LONG windows
/// (60 / 3_600 / 3_600 / appeal) so the scheduled `reveal_end` is ~2h out.
fn setup_env(reveal_threshold_bps: u16) -> Env {
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
            accord_state: pause,
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

    let domain_ref = {
        let mut rt = [0u8; 32];
        rt[0] = 42;
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
                review_window: REVIEW,
                commit_window: COMMIT,
                reveal_window: REVEAL,
                appeal_window: APPEAL,
                max_appeals: 3,
                min_jury_size: 3,
                aggregation: Aggregation::Plurality,
                coherence_tol_bps: 0,
                fee_per_juror: TEST_FPJ,
                reveal_threshold_bps,
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

    Env {
        ctx,
        creator,
        mint,
        subaccord: sub,
    }
}

fn now_of(env: &Env) -> i64 {
    env.ctx.svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_seconds(env: &mut Env, secs: i64) {
    let mut clock = env.ctx.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = clock.unix_timestamp.saturating_add(secs);
    env.ctx.svm.set_sysvar::<Clock>(&clock);
}

fn read_dispute(env: &Env, dispute: &Pubkey) -> Dispute {
    Dispute::try_deserialize(&mut &env.ctx.svm.get_account(dispute).unwrap().data[..]).unwrap()
}

fn round_windows(env: &Env, rnd: &Pubkey) -> (i64, i64, i64) {
    let acc = env.ctx.svm.get_account(rnd).unwrap();
    let round: &accord::state::Round = bytemuck::from_bytes(&acc.data[8..]);
    (round.review_end, round.commit_end, round.reveal_end)
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

fn do_stake(env: &mut Env, juror: &Keypair, amount: u64, path: Vec<MSTNode>) {
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
    env.ctx
        .execute_instruction(ix, &[juror])
        .unwrap()
        .assert_success();
}

/// Stake `n` jurors at 5_000 each. Returns (keypairs, leaves).
fn stake_jurors(env: &mut Env, n: usize) -> (Vec<Keypair>, Vec<(Pubkey, u64)>) {
    let mut jurors = Vec::new();
    let mut leaves: Vec<(Pubkey, u64)> = Vec::new();
    for i in 0..n {
        let juror = Keypair::new();
        arm_juror(env, &juror, 10_000);
        let (_, _, path) = build_root_and_path(&leaves, TEST_DEPTH, i as u32);
        do_stake(env, &juror, 5_000, path);
        leaves.push((juror.pubkey(), 5_000));
        jurors.push(juror);
    }
    (jurors, leaves)
}

fn inject_vrf_freeze(env: &mut Env, dispute: &Pubkey, vrf: [u8; 32]) {
    let sub = {
        let acc = env.ctx.svm.get_account(&env.subaccord).unwrap();
        accord::state::Subaccord::try_deserialize(&mut &acc.data[..]).unwrap()
    };
    let acc = env.ctx.svm.get_account(dispute).expect("dispute exists");
    let mut d = Dispute::try_deserialize(&mut &acc.data[..]).unwrap();
    d.committed_vrf = Some(vrf);
    d.frozen_root = sub.root_hash;
    d.frozen_total_stake = sub.total_stake;
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

/// File a 2-option dispute under `env.subaccord` with the given nonce and
/// inject the VRF freeze. Returns (dispute_pda, filer).
fn file_dispute(env: &mut Env, nonce: u64) -> (Pubkey, Keypair) {
    let filer = Keypair::new();
    env.ctx
        .svm
        .airdrop(&filer.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &fata, &env.mint, &filer.pubkey(), 1_000_000);
    let dispute = dispute_pda(&filer.pubkey(), nonce);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::CreateDispute {
            filer: filer.pubkey(),
            rent_payer: filer.pubkey(),
            subaccord: env.subaccord,
            accord_state: pause_pda(),
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
            fee: 4 * TEST_FPJ, /* ADR-0030: (J+1)·fpj tender */
        })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[&filer])
        .unwrap()
        .assert_success();

    let vrf = {
        let mut c = [0u8; 32];
        c.copy_from_slice(&dispute.to_bytes());
        c
    };
    inject_vrf_freeze(env, &dispute, vrf);
    (dispute, filer)
}

/// Sortition mirror of `draw_seat` (see accumulator_litesvm.rs). Resolves
/// `n_seats` distinct jurors at `(vrf, round_idx, draw_attempt)` and submits
/// each seat. Returns `(seat, leaf_idx)` per drawn seat.
fn draw_panel(
    env: &mut Env,
    dispute: Pubkey,
    rnd: Pubkey,
    round_idx: u32,
    draw_attempt: u32,
    n_seats: u32,
    leaves: &[(Pubkey, u64)],
) -> Vec<(u32, usize)> {
    let vrf = {
        let mut c = [0u8; 32];
        c.copy_from_slice(&dispute.to_bytes());
        c
    };
    let total: u64 = leaves.iter().map(|(_, s)| s).sum();
    let prefixes: Vec<u64> = {
        let mut p = Vec::new();
        let mut a = 0u64;
        for (_, s) in leaves {
            p.push(a);
            a += s;
        }
        p
    };
    let seed = hashv(&[
        &vrf,
        dispute.as_ref(),
        &round_idx.to_le_bytes(),
        &draw_attempt.to_le_bytes(),
    ])
    .to_bytes();
    let mut drawn: Vec<(u32, usize)> = Vec::new();
    for seat in 0..n_seats {
        let mut chosen: Option<(usize, u32)> = None;
        for retry in 0..=accord::constants::MAX_SORTITION_RETRIES {
            let rh = hashv(&[&seed, &seat.to_le_bytes(), &retry.to_le_bytes()]).to_bytes();
            let ri = u64::from_le_bytes(rh[0..8].try_into().unwrap()) % total;
            let mut idx = 0;
            for (i, (_, s)) in leaves.iter().enumerate() {
                if ri >= prefixes[i] && ri - prefixes[i] < *s {
                    idx = i;
                    break;
                }
            }
            if !drawn.iter().any(|&(_, l)| l == idx) {
                chosen = Some((idx, retry));
                break;
            }
        }
        let (leaf_idx, retry) = chosen.expect("retry budget exhausted");

        let (juror_pub, stake) = leaves[leaf_idx];
        let (_, _, proof) = build_root_and_path(leaves, TEST_DEPTH, leaf_idx as u32);
        let membership = accord::state::JurorMembership {
            leaf: LeafClaim {
                juror: juror_pub,
                stake,
            },
            proof,
            index: leaf_idx as u32,
        };
        // Fresh caller per seat: LiteSVM dedups byte-identical txs.
        let caller = Keypair::new();
        env.ctx
            .svm
            .airdrop(&caller.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();
        let ix = env
            .ctx
            .program()
            .accounts(accounts::DrawSeat {
                caller: caller.pubkey(),
                dispute,
                subaccord: env.subaccord,
                round: rnd,
                system_program: system_program::ID,
            })
            .args(instruction::DrawSeat {
                seat,
                retries: retry,
                membership,
            })
            .instruction()
            .unwrap();
        let js_pda = juror_stake_pda(&env.subaccord, &juror_pub);
        let ix = solana_program::instruction::Instruction {
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
            .execute_instruction(ix, &[&caller])
            .unwrap()
            .assert_success();
        drawn.push((seat, leaf_idx));
    }
    drawn
}

/// Commit `vote` for `juror` (per-juror deterministic salt, consistent with
/// `reveal_seat`).
fn commit_seat(env: &mut Env, dispute: Pubkey, rnd: Pubkey, juror: &Keypair, vote: u64) {
    let salt = hashv(&[b"salt", juror.pubkey().as_ref()]).to_bytes();
    let comm = hashv(&[&vote.to_le_bytes(), &salt, juror.pubkey().as_ref()]).to_bytes();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Commit {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::Commit { commitment: comm })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[juror])
        .unwrap()
        .assert_success();
}

fn reveal_seat(env: &mut Env, dispute: Pubkey, rnd: Pubkey, juror: &Keypair, vote: u64) {
    let salt = hashv(&[b"salt", juror.pubkey().as_ref()]).to_bytes();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Reveal {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::Reveal { vote, salt })
        .instruction()
        .unwrap();
    env.ctx
        .execute_instruction(ix, &[juror])
        .unwrap()
        .assert_success();
}

fn try_reveal_seat(
    env: &mut Env,
    dispute: Pubkey,
    rnd: Pubkey,
    juror: &Keypair,
    vote: u64,
) -> TransactionResult {
    let salt = hashv(&[b"salt", juror.pubkey().as_ref()]).to_bytes();
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Reveal {
            juror: juror.pubkey(),
            subaccord: env.subaccord,
            dispute,
            round: rnd,
        })
        .args(instruction::Reveal { vote, salt })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[juror]).unwrap()
}

fn try_finalize_round(env: &mut Env, dispute: Pubkey, rnd: Pubkey) -> TransactionResult {
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
    env.ctx.execute_instruction(ix, &[&env.creator]).unwrap()
}

fn try_finalize_dispute(
    env: &mut Env,
    dispute: Pubkey,
    rnd: Pubkey,
    drawn: &[(u32, usize)],
    leaves: &[(Pubkey, u64)],
) -> TransactionResult {
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
    let ix = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut a = ix.accounts;
            for &(_, li) in drawn {
                a.push(solana_program::instruction::AccountMeta {
                    pubkey: juror_stake_pda(&env.subaccord, &leaves[li].0),
                    is_signer: false,
                    is_writable: true,
                });
            }
            a
        },
        data: ix.data,
    };
    env.ctx.execute_instruction(ix, &[&env.creator]).unwrap()
}

fn try_appeal(env: &mut Env, dispute: Pubkey, appellant: &Keypair) -> TransactionResult {
    let d = read_dispute(env, &dispute);
    let round = round_pda(&dispute, d.current_round);
    let appeal_bond = Pubkey::find_program_address(
        &[
            SEED_APPEAL_BOND,
            dispute.as_ref(),
            &d.current_round.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let appellant_ata = juror_ata(&appellant.pubkey(), &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Appeal {
            appellant: appellant.pubkey(),
            subaccord: env.subaccord,
            accord_state: pause_pda(),
            dispute,
            round,
            appeal_bond,
            fee_token: env.mint,
            appellant_token_account: appellant_ata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        })
        .args(instruction::Appeal {
            new_evidence_hash: [0x99; 32],
        })
        .instruction()
        .unwrap();
    env.ctx.execute_instruction(ix, &[appellant]).unwrap()
}

/// Fund a fresh appellant with `balance` fee tokens.
fn fund_appellant(env: &mut Env, balance: u64) -> Keypair {
    let appellant = Keypair::new();
    env.ctx
        .svm
        .airdrop(&appellant.pubkey(), 50 * LAMPORTS_PER_SOL)
        .unwrap();
    let ata = juror_ata(&appellant.pubkey(), &env.mint);
    create_token_account(&mut env.ctx, &ata, &env.mint, &appellant.pubkey(), balance);
    appellant
}

/// Full eager lifecycle up to `RoundResolved`: file (nonce), draw the 3-seat
/// panel, commit + reveal every seat (all at one clock instant inside the
/// commit window), and finalize early. Returns everything the caller asserts on.
struct EagerRound {
    dispute: Pubkey,
    filer: Keypair,
    rnd: Pubkey,
    drawn: Vec<(u32, usize)>,
}

fn eager_resolved_round(
    env: &mut Env,
    jurors: &[Keypair],
    leaves: &[(Pubkey, u64)],
    nonce: u64,
    vote: u64,
) -> EagerRound {
    let (dispute, filer) = file_dispute(env, nonce);
    let rnd = round_pda(&dispute, 0);
    let drawn = draw_panel(env, dispute, rnd, 0, 0, 3, leaves);

    // Into the commit window, one second past review_end.
    let (_, commit_end, reveal_end) = round_windows(env, &rnd);
    let now = now_of(env);
    warp_seconds(env, commit_end - REVIEW as i64 - 1 - now); // review_end + 1
    assert!(now_of(env) < commit_end && now_of(env) + 5 < reveal_end);

    for &(_, leaf_idx) in &drawn {
        commit_seat(env, dispute, rnd, &jurors[leaf_idx], vote);
    }
    for &(_, leaf_idx) in &drawn {
        reveal_seat(env, dispute, rnd, &jurors[leaf_idx], vote);
    }
    try_finalize_round(env, dispute, rnd).assert_success();
    EagerRound {
        dispute,
        filer,
        rnd,
        drawn,
    }
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// Site 1 — `commit` (panel-full): the reveal window starts when the LAST
/// commitment lands, not at the scheduled `commit_end + reveal_window`.
/// Shrink-only: every committed juror still gets the full `reveal_window`.
#[test]
fn panel_full_commit_re_anchors_reveal_end_to_last_commit() {
    let mut env = setup_env(6_666);
    let (jurors, leaves) = stake_jurors(&mut env, 3);
    let (dispute, _filer) = file_dispute(&mut env, 1);
    let rnd = round_pda(&dispute, 0);
    let drawn = draw_panel(&mut env, dispute, rnd, 0, 0, 3, &leaves);

    let (_, commit_end, scheduled_reveal_end) = round_windows(&env, &rnd);

    // Into the commit window: review_end + 1 (an eager panel commits early).
    let now = now_of(&env);
    warp_seconds(&mut env, commit_end - REVIEW as i64 - 1 - now);
    let t_commit = now_of(&env);
    assert!(t_commit < commit_end);

    // First 2 commitments: no re-anchor yet (not panel-full).
    for &(_, leaf_idx) in &drawn[..2] {
        commit_seat(&mut env, dispute, rnd, &jurors[leaf_idx], 0);
    }
    assert_eq!(
        round_windows(&env, &rnd).2,
        scheduled_reveal_end,
        "partial commit must not move reveal_end"
    );

    // Last commitment: reveal_end re-anchors to t_commit + reveal_window.
    let (_, leaf_idx) = drawn[2];
    commit_seat(&mut env, dispute, rnd, &jurors[leaf_idx], 0);
    let re_anchored = round_windows(&env, &rnd).2;
    assert_eq!(
        re_anchored,
        t_commit + REVEAL as i64,
        "panel-full commit re-anchors reveal_end to now + reveal_window"
    );
    assert!(
        re_anchored < scheduled_reveal_end,
        "re-anchoring is shrink-only"
    );
}

/// The re-anchored `reveal_end` is a real upper bound: reveals are accepted
/// inside `reveal_window` of the last commit and rejected at/after it.
#[test]
fn reveal_closes_at_re_anchored_end() {
    let mut env = setup_env(6_666);
    let (jurors, leaves) = stake_jurors(&mut env, 3);
    let (dispute, _filer) = file_dispute(&mut env, 1);
    let rnd = round_pda(&dispute, 0);
    let drawn = draw_panel(&mut env, dispute, rnd, 0, 0, 3, &leaves);

    let (_, commit_end, _) = round_windows(&env, &rnd);
    let now = now_of(&env);
    warp_seconds(&mut env, commit_end - REVIEW as i64 - 1 - now);
    let t_commit = now_of(&env);

    for &(_, leaf_idx) in &drawn {
        commit_seat(&mut env, dispute, rnd, &jurors[leaf_idx], 0);
    }
    let re_anchored = round_windows(&env, &rnd).2;
    assert_eq!(re_anchored, t_commit + REVEAL as i64);

    // Reveal one juror immediately — well inside the re-anchored window.
    let (_, a) = drawn[0];
    reveal_seat(&mut env, dispute, rnd, &jurors[a], 0);

    // Last valid second: still accepted.
    let delta = re_anchored - now_of(&env) - 1;
    warp_seconds(&mut env, delta);
    assert_eq!(now_of(&env), re_anchored - 1);
    let (_, b) = drawn[1];
    reveal_seat(&mut env, dispute, rnd, &jurors[b], 0);

    // At the re-anchored end the window is CLOSED (scheduled end is 1h later).
    warp_seconds(&mut env, 1);
    let (_, c) = drawn[2];
    let r = try_reveal_seat(&mut env, dispute, rnd, &jurors[c], 0);
    assert!(
        !r.is_success(),
        "reveal must close at the re-anchored reveal_end; error: {:?}",
        r.error()
    );
}

/// Site 2 — `finalize_round` (early resolve): `reveal_end` pins to the
/// resolution instant, so the appeal window opens at resolution and finality
/// follows at `resolve_ts + appeal_window` instead of the scheduled end.
#[test]
fn early_resolve_re_anchors_appeal_window_and_finality() {
    // 7 stakers: a real appeal (round 1 = 7-seat panel) must be viable inside
    // the re-anchored window.
    let mut env = setup_env(6_666);
    let (jurors, leaves) = stake_jurors(&mut env, 7);

    // Dispute A: early resolve at t_r; appeal must be ACCEPTED at t_r
    // (window re-anchored open at resolution).
    let er = eager_resolved_round(&mut env, &jurors, &leaves, 1, 1);
    let t_resolve = round_windows(&env, &er.rnd).2;
    assert_eq!(
        read_dispute(&env, &er.dispute).state,
        DisputeState::RoundResolved
    );
    assert!(
        t_resolve < now_of(&env) + REVEAL as i64,
        "early resolve pins reveal_end at the resolution instant"
    );

    // finalize_dispute at t_resolve: appeal window still open → must fail.
    let r = try_finalize_dispute(&mut env, er.dispute, er.rnd, &er.drawn, &leaves);
    assert!(
        !r.is_success(),
        "finalize_dispute must stay blocked until resolve_ts + appeal_window; error: {:?}",
        r.error()
    );

    // Appeal INSIDE the re-anchored window succeeds (7 stakers ≥ panel 7).
    let appellant = fund_appellant(&mut env, 10_000_000);
    try_appeal(&mut env, er.dispute, &appellant).assert_success();

    // Dispute B: identical eager round; appeal AFTER the re-anchored deadline
    // must be REJECTED. (Old anchor: window stayed open for another hour.)
    let er2 = eager_resolved_round(&mut env, &jurors, &leaves, 2, 1);
    warp_seconds(&mut env, APPEAL as i64 + 1); // past resolve_ts + appeal_window
    let r = try_appeal(&mut env, er2.dispute, &appellant);
    assert!(
        !r.is_success(),
        "appeal must close at resolve_ts + appeal_window; error: {:?}",
        r.error()
    );

    // Dispute C: eager round → finalize_dispute becomes eligible exactly at
    // resolve_ts + appeal_window (≈40s after draw for a 1s-review court, not
    // the scheduled ~2h).
    let er3 = eager_resolved_round(&mut env, &jurors, &leaves, 3, 1);
    let r = try_finalize_dispute(&mut env, er3.dispute, er3.rnd, &er3.drawn, &leaves);
    assert!(
        !r.is_success(),
        "finalize_dispute before resolve_ts + appeal_window must fail; error: {:?}",
        r.error()
    );
    warp_seconds(&mut env, APPEAL as i64 + 1);
    // Warp does not move the blockhash: expire it so this finalize_dispute is
    // not deduped as a replay of the (failed) call above.
    env.ctx.svm.expire_blockhash();
    try_finalize_dispute(&mut env, er3.dispute, er3.rnd, &er3.drawn, &leaves).assert_success();
    assert_eq!(read_dispute(&env, &er3.dispute).state, DisputeState::Final);
}

/// Timeout path: a lazy cranker landing `finalize_round` AFTER `reveal_end`
/// must not extend anything — `reveal_end` keeps its pre-finalize value and
/// the appeal deadline stays `reveal_end + appeal_window`.
#[test]
fn late_finalize_round_does_not_extend_reveal_end() {
    let mut env = setup_env(6_666);
    let (jurors, leaves) = stake_jurors(&mut env, 3);
    let (dispute, _filer) = file_dispute(&mut env, 1);
    let rnd = round_pda(&dispute, 0);
    let drawn = draw_panel(&mut env, dispute, rnd, 0, 0, 3, &leaves);

    let (_, commit_end, _) = round_windows(&env, &rnd);
    let now = now_of(&env);
    warp_seconds(&mut env, commit_end - REVIEW as i64 - 1 - now);
    let t_commit = now_of(&env);

    // Panel-full commit re-anchors; 2 of 3 reveal (threshold 6_666 needs 2).
    for &(_, leaf_idx) in &drawn {
        commit_seat(&mut env, dispute, rnd, &jurors[leaf_idx], 0);
    }
    let re_anchored = round_windows(&env, &rnd).2;
    assert_eq!(re_anchored, t_commit + REVEAL as i64);
    reveal_seat(&mut env, dispute, rnd, &jurors[drawn[0].1], 0);
    reveal_seat(&mut env, dispute, rnd, &jurors[drawn[1].1], 0);

    // Lazy cranker: lands 500s AFTER the (re-anchored) reveal_end.
    let delta = re_anchored - now_of(&env) + 500;
    warp_seconds(&mut env, delta);
    let t_late = now_of(&env);
    try_finalize_round(&mut env, dispute, rnd).assert_success();
    assert_eq!(
        round_windows(&env, &rnd).2,
        re_anchored,
        "timeout finalize must not move reveal_end (non-extension)"
    );

    // Appeal deadline is re_anchored + appeal_window — already far past at
    // t_late, so finalize_dispute is immediately eligible.
    assert!(t_late >= re_anchored + APPEAL as i64);
    try_finalize_dispute(&mut env, dispute, rnd, &drawn, &leaves).assert_success();
    assert_eq!(read_dispute(&env, &dispute).state, DisputeState::Final);
}

/// Interaction: a re-anchored round that goes to shortfall still redraws
/// cleanly — `redraw` zeroes the windows and a fresh panel re-anchors at the
/// NEW draw time.
#[test]
fn re_anchored_round_redraw_still_zeroes_and_re_anchors() {
    let mut env = setup_env(10_000); // needs all 3 reveals
    let (jurors, leaves) = stake_jurors(&mut env, 3);
    let (dispute, filer) = file_dispute(&mut env, 1);
    let rnd = round_pda(&dispute, 0);
    let drawn = draw_panel(&mut env, dispute, rnd, 0, 0, 3, &leaves);

    let (_, commit_end, _) = round_windows(&env, &rnd);
    let now = now_of(&env);
    warp_seconds(&mut env, commit_end - REVIEW as i64 - 1 - now);
    let t_commit = now_of(&env);

    // All commit (re-anchor), only 1 reveals → shortfall at timeout.
    for &(_, leaf_idx) in &drawn {
        commit_seat(&mut env, dispute, rnd, &jurors[leaf_idx], 0);
    }
    let re_anchored = round_windows(&env, &rnd).2;
    assert_eq!(re_anchored, t_commit + REVEAL as i64);
    reveal_seat(&mut env, dispute, rnd, &jurors[drawn[0].1], 0);

    let delta = re_anchored - now_of(&env) + 1;
    warp_seconds(&mut env, delta);
    try_finalize_round(&mut env, dispute, rnd).assert_success();
    assert_eq!(
        read_dispute(&env, &dispute).state,
        DisputeState::RedrawEligible
    );

    // redraw: zeroes the (re-anchored) windows, dispute back to Created.
    let fata = juror_ata(&filer.pubkey(), &env.mint);
    let ix = env
        .ctx
        .program()
        .accounts(accounts::Redraw {
            caller: env.creator.pubkey(),
            subaccord: env.subaccord,
            round: rnd,
            dispute,
            fee_token: env.mint,
            filer_token_account: fata,
            fee_vault: vault_ata(&env.subaccord, &env.mint),
            token_program: TOKEN_PROGRAM_ID,
        })
        .args(instruction::Redraw {})
        .instruction()
        .unwrap();
    let ix = solana_program::instruction::Instruction {
        program_id: ix.program_id,
        accounts: {
            let mut accts = ix.accounts;
            for &(_, leaf_idx) in &drawn {
                accts.push(solana_program::instruction::AccountMeta {
                    pubkey: juror_stake_pda(&env.subaccord, &leaves[leaf_idx].0),
                    is_signer: false,
                    is_writable: true,
                });
            }
            accts
        },
        data: ix.data,
    };
    env.ctx
        .execute_instruction(ix, &[&env.creator])
        .unwrap()
        .assert_success();
    assert_eq!(read_dispute(&env, &dispute).state, DisputeState::Created);
    assert_eq!(
        round_windows(&env, &rnd),
        (0, 0, 0),
        "redraw zeroes windows"
    );

    // Fresh panel at draw_attempt 1: windows re-anchor at the NEW draw time.
    let drawn2 = draw_panel(&mut env, dispute, rnd, 0, 1, 3, &leaves);
    let (review2, commit2, reveal2) = round_windows(&env, &rnd);
    let t_draw2 = now_of(&env);
    assert_eq!(review2, t_draw2 + REVIEW as i64);
    assert_eq!(commit2, t_draw2 + (REVIEW + COMMIT) as i64);
    assert_eq!(reveal2, t_draw2 + (REVIEW + COMMIT + REVEAL) as i64);
    assert_eq!(drawn2.len(), 3);
}
