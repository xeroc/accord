//! # VeriDAO Accord
//!
//! General-purpose, Schelling-point-based decentralized arbitration accord on
//! Solana. Standalone primitive — the "Kleros of Solana." Any program can file
//! a Dispute; the Accord draws stake-weighted Jurors (Switchboard VRF), collects
//! commit-reveal votes, and emits Rulings governed by coherence incentives.
//!
//! ## Program surface (v1 target)
//!
//! - `create_subaccord` — permissionless specialized juror pool (staking token,
//!   min stake, review/commit/reveal windows, alpha slash factor)
//! - `stake` / `unstake` — juror capital into a Subaccord (USDC in v1)
//! - `create_dispute` — the **Arbitrable** CPI entry: subaccord, options,
//!   evidence hash, fee → dispute id
//! - `draw` — random stake-weighted juror selection (Switchboard VRF)
//! - `commit` / `reveal` — `hash(vote, salt)` then `{vote, salt}`
//! - `appeal` — escalate to 2N+1 jurors; losing party posts an appeal bond
//! - `execute_ruling` — write the winning option; lazy-read by the filer
//!
//! ## Spec authority
//!
//! - `PROJECT.md` (rationale), `CONTEXT.md` (domain language), `programs/accord/SPEC.md` (build spec)
//! - `docs/adr/0001` Schelling, `0002` per-Subaccord staking token, `0003` draw,
//!   `0004` party-agnostic, `0005` Subaccord authority, `0006` evidence, `0007` upgrade
//!
//! Build order: this program ships FIRST. Client programs (the Arbitrable)
//! integrate via the Arbitrable CPI.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

pub use constants::*;
pub use errors::AccordError;
pub use events::*;
pub use state::*;

// Program id for the Accord. (`anchor build` normally provisions this; it is
// blocked by the platform-tools/edition2024 toolchain issue — see AGENTS.md —
// so the keypair was generated with `solana-keygen` into target/deploy/.)
declare_id!("RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe");

#[program]
pub mod accord {
    use super::*;

    /// Liveness probe and LiteSVM harness anchor (veridao-8ys4).
    ///
    /// No state, no accounts — returns `Ok(())` and emits a version event.
    /// Arbitrables / ops may call it to confirm the program is reachable. It
    /// exists so the testing harness has a trivial instruction to round-trip;
    /// every subsequent instruction ships with its own LiteSVM `#[test]`.
    pub fn health(_ctx: Context<Health>) -> Result<()> {
        emit!(HealthChecked { version: 1 });
        Ok(())
    }

    // --- Circuit breaker (ADR-0007; veridao-63v3) ---
    // `pause` is instant + authority-gated; `unpause` is timelocked
    // (propose_unpause arms it, execute_unpause lands after the notice slot).
    // While paused, create_dispute / stake / appeal revert; in-flight disputes
    // resolve normally. The halt is enforced inside each of those instructions
    // (`require!(!pause_state.paused, ProgramPaused)`); this module only owns
    // the breaker itself.

    /// One-time init of the pause singleton. The caller becomes the pause
    /// authority (typically the Squads multisig / upgrade authority). Call at
    /// deploy; front-running is an ops concern (bundle init with deploy).
    pub fn initialize_pause(ctx: Context<InitializePause>) -> Result<()> {
        ctx.accounts.pause_state.authority = ctx.accounts.authority.key();
        ctx.accounts.pause_state.paused = false;
        ctx.accounts.pause_state.pending_unpause_after = None;
        ctx.accounts.pause_state.bump = ctx.bumps.pause_state;
        Ok(())
    }

    /// Instant, authority-gated emergency freeze.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.pause_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(!ctx.accounts.pause_state.paused, AccordError::AlreadyPaused);
        ctx.accounts.pause_state.paused = true;
        // a fresh pause cancels any pending unpause
        ctx.accounts.pause_state.pending_unpause_after = None;
        emit!(Paused {
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    /// Authority-gated: arms an unpause executable after `UNPAUSE_TIMELOCK_SLOTS`.
    pub fn propose_unpause(ctx: Context<ProposeUnpause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.pause_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(ctx.accounts.pause_state.paused, AccordError::NotPaused);
        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UNPAUSE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;
        ctx.accounts.pause_state.pending_unpause_after = Some(execute_after);
        emit!(UnpauseProposed {
            execute_after_slot: execute_after,
        });
        Ok(())
    }

    /// Permissionless crank: lands the unpause once the notice slot has passed.
    pub fn execute_unpause(ctx: Context<ExecuteUnpause>) -> Result<()> {
        let execute_after = ctx
            .accounts
            .pause_state
            .pending_unpause_after
            .ok_or(AccordError::NoPendingUnpause)?;
        let slot = Clock::get()?.slot;
        require!(
            slot >= execute_after,
            AccordError::UnpauseTimelockNotElapsed
        );
        let authority = ctx.accounts.pause_state.authority;
        ctx.accounts.pause_state.paused = false;
        ctx.accounts.pause_state.pending_unpause_after = None;
        emit!(Unpaused { authority });
        Ok(())
    }

    // --- Subaccord management (ADR-0005; veridao-ek65) ---

    /// Permissionless creation of a specialized Juror pool. Seeds
    /// `["subaccord", creator, risk_type]`, so each creator owns a private
    /// namespace per `risk_type`. `risk_type` + `evidence_spec` are immutable
    /// identity hashes; every other param routes through propose/execute
    /// (ADR-0005). `authority == Pubkey::default()` => immutable.
    #[allow(clippy::too_many_arguments)]
    pub fn create_subaccord(
        ctx: Context<CreateSubaccord>,
        risk_type: [u8; 32],
        evidence_spec: [u8; 32],
        staking_token: Pubkey,
        min_stake: u64,
        jurors_per_dispute: u32,
        alpha_bps: u16,
        review_window: u64,
        commit_window: u64,
        reveal_window: u64,
        max_appeals: u8,
        fee_per_juror: u64,
        authority: Pubkey,
        evidence_operator: Pubkey,
    ) -> Result<()> {
        // Namespace guard: reject the degenerate zero-hash risk_type so the
        // default identity can't be silently squatting a namespace.
        require!(risk_type != [0u8; 32], AccordError::InvalidOptions);
        // Appeal-bond arrays on `Dispute` are sized to `MAX_APPEALS`; a
        // Subaccord may not promise more appeals than the program can custody.
        require!(
            max_appeals as usize <= MAX_APPEALS,
            AccordError::MaxAppealsLimitExceeded
        );

        let acc = &mut ctx.accounts.subaccord;
        acc.creator = ctx.accounts.creator.key();
        acc.staking_token = staking_token;
        acc.min_stake = min_stake;
        acc.jurors_per_dispute = jurors_per_dispute;
        acc.alpha_bps = alpha_bps;
        acc.review_window = review_window;
        acc.commit_window = commit_window;
        acc.reveal_window = reveal_window;
        acc.max_appeals = max_appeals;
        acc.fee_per_juror = fee_per_juror;
        acc.authority = authority;
        acc.evidence_operator = evidence_operator;
        acc.risk_type = risk_type;
        acc.evidence_spec = evidence_spec;
        acc.bump = ctx.bumps.subaccord;

        emit!(SubaccordCreated {
            creator: ctx.accounts.creator.key(),
            subaccord: acc.key(),
            staking_token,
            risk_type,
        });
        Ok(())
    }

    /// Stake Juror capital into a Subaccord. SPL-transfers `amount` of the
    /// Subaccord's `staking_token` from the Juror's ATA into the Subaccord
    /// PDA's vault ATA (lazily created on first stake). The `JurorStake` PDA is
    /// init'd on first stake and topped up on subsequent stakes.
    ///
    /// Credits the **actual delta** the vault received (fee-on-transfer safe:
    /// Token-2022 transfer fees would make delta < amount). Reverts while the
    /// circuit breaker is paused (ADR-0007).
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.pause_state.paused, AccordError::ProgramPaused);
        require!(amount > 0, AccordError::InvalidAmount);

        let before = ctx.accounts.vault.amount;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.juror_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.juror.to_account_info(),
                },
            ),
            amount,
        )?;

        // Fee-on-transfer safe: reload + credit the real delta the vault got.
        ctx.accounts.vault.reload()?;
        let after = ctx.accounts.vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let js = &mut ctx.accounts.juror_stake;
        js.subaccord = ctx.accounts.subaccord.key();
        js.juror = ctx.accounts.juror.key();
        js.bump = ctx.bumps.juror_stake;
        js.last_change_slot = Clock::get()?.slot;
        // active_draws intentionally untouched: 0 on fresh init, preserved on top-up.
        let prev_amount = js.amount;
        js.amount = js
            .amount
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Maintain the coarse distinct-staker counter (SPEC intake gate for
        // create_dispute/appeal). First-ever stake (0 -> positive) counts a new
        // distinct Juror; top-ups do not. See Subaccord.staker_count doc.
        if prev_amount == 0 {
            ctx.accounts.subaccord.staker_count = ctx
                .accounts
                .subaccord
                .staker_count
                .checked_add(1)
                .ok_or(AccordError::ArithmeticOverflow)?;
        }

        emit!(Staked {
            subaccord: ctx.accounts.subaccord.key(),
            juror: ctx.accounts.juror.key(),
            amount: delta,
        });
        Ok(())
    }

    /// Withdraw staked capital from a Subaccord. PDA-signed SPL transfer from
    /// the Subaccord PDA's vault ATA to the Juror's ATA. Reverts while the
    /// Juror is drawn into any live dispute (`active_draws > 0`, ADR-0003) and
    /// caps the withdrawal at the Juror's exact staked balance.
    ///
    /// Allowed while the program is paused (ADR-0007 lists only
    /// create_dispute / stake / appeal as halted — capital is never trapped).
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, AccordError::InvalidAmount);
        require!(
            ctx.accounts.juror_stake.active_draws == 0,
            AccordError::StakeLocked
        );
        require!(
            amount <= ctx.accounts.juror_stake.amount,
            AccordError::InsufficientBalance
        );

        let bump = [ctx.accounts.subaccord.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            ctx.accounts.subaccord.creator.as_ref(),
            ctx.accounts.subaccord.risk_type.as_ref(),
            &bump,
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.juror_token_account.to_account_info(),
                    authority: ctx.accounts.subaccord.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;

        let js = &mut ctx.accounts.juror_stake;
        let prev_amount = js.amount;
        js.amount = js
            .amount
            .checked_sub(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        js.last_change_slot = Clock::get()?.slot;

        // Full unstake (positive -> 0) drops a distinct Juror from the counter.
        if js.amount == 0 && prev_amount > 0 {
            ctx.accounts.subaccord.staker_count =
                ctx.accounts.subaccord.staker_count.saturating_sub(1);
        }

        emit!(Unstaked {
            subaccord: ctx.accounts.subaccord.key(),
            juror: ctx.accounts.juror.key(),
            amount,
        });
        Ok(())
    }

    // --- Subaccord authority / timelock (ADR-0005; veridao-y63e) ---

    /// Authority-gated proposal of a Subaccord parameter update. The update is
    /// written to a `PendingUpdate` PDA keyed by `(subaccord, nonce)` and becomes
    /// executable only after `UPDATE_TIMELOCK_SLOTS` (48h) elapses — giving
    /// stakers a window to unstake before a change lands. No-op for immutable
    /// Subaccords (`authority == default`). The nonce is caller-chosen; PDA
    /// `init` enforces uniqueness (a reused nonce simply fails to init).
    pub fn propose_subaccord_update(
        ctx: Context<ProposeSubaccordUpdate>,
        nonce: u64,
        payload: UpdatePayload,
    ) -> Result<()> {
        let sub = &ctx.accounts.subaccord;
        require!(
            sub.authority != Pubkey::default(),
            AccordError::ImmutableSubaccord
        );
        require!(
            ctx.accounts.authority.key() == sub.authority,
            AccordError::Unauthorized
        );

        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UPDATE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let pu = &mut ctx.accounts.pending_update;
        pu.subaccord = ctx.accounts.subaccord.key();
        pu.nonce = nonce;
        pu.proposed = payload.clone();
        pu.proposed_by = ctx.accounts.authority.key();
        pu.execute_after_slot = execute_after;
        pu.bump = ctx.bumps.pending_update;

        emit!(UpdateProposed {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
            payload,
            execute_after_slot: execute_after,
        });
        Ok(())
    }

    /// Permissionless crank: applies a timelocked `PendingUpdate` to its Subaccord
    /// once the 48h notice slot has passed. Anyone may execute — the timelock is
    /// the protection, not the executor. The `PendingUpdate` is closed (rent to
    /// the caller) once applied.
    pub fn execute_subaccord_update(ctx: Context<ExecuteSubaccordUpdate>) -> Result<()> {
        let nonce = ctx.accounts.pending_update.nonce;
        let execute_after = ctx.accounts.pending_update.execute_after_slot;
        let slot = Clock::get()?.slot;
        require!(slot >= execute_after, AccordError::TimelockNotElapsed);

        let sub = &mut ctx.accounts.subaccord;
        match &ctx.accounts.pending_update.proposed {
            UpdatePayload::MinStake(v) => sub.min_stake = *v,
            UpdatePayload::JurorsPerDispute(v) => sub.jurors_per_dispute = *v,
            UpdatePayload::AlphaBps(v) => sub.alpha_bps = *v,
            UpdatePayload::ReviewWindow(v) => sub.review_window = *v,
            UpdatePayload::CommitWindow(v) => sub.commit_window = *v,
            UpdatePayload::RevealWindow(v) => sub.reveal_window = *v,
            UpdatePayload::MaxAppeals(v) => sub.max_appeals = *v,
            UpdatePayload::FeePerJuror(v) => sub.fee_per_juror = *v,
            UpdatePayload::Authority(v) => sub.authority = *v,
            UpdatePayload::EvidenceOperator(v) => sub.evidence_operator = *v,
        }

        emit!(UpdateExecuted {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
        });
        Ok(())
    }

    // --- Dispute intake & Snapshot trust (ADR-0003/0004; veridao-rrxs) ---

    /// The **Arbitrable CPI entry**: any program files a Dispute. The filer pays
    /// the full round-1 fee (`jurors_per_dispute · fee_per_juror`) into the
    /// Subaccord vault, so the on-chain fee is authoritative — the caller's
    /// `fee` must match exactly (defense-in-depth: the filer signs the exact
    /// charge). Reverts while paused (ADR-0007) and if the Subaccord has fewer
    /// distinct stakers than the required panel (`staker_count` coarse gate;
    /// ADR-0003 snapshot does the precise eligibility check at draw).
    pub fn create_dispute(
        ctx: Context<CreateDispute>,
        options: Vec<[u8; 32]>,
        evidence_hash: [u8; 32],
        nonce: u64,
        fee: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.pause_state.paused, AccordError::ProgramPaused);

        let n = options.len();
        require!((2..=MAX_OPTIONS).contains(&n), AccordError::InvalidOptions);

        let sub = &ctx.accounts.subaccord;
        let required_fee = (sub.jurors_per_dispute as u64)
            .checked_mul(sub.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(fee == required_fee, AccordError::FeeMismatch);

        require!(
            sub.staker_count >= sub.jurors_per_dispute,
            AccordError::InsufficientJurors
        );

        // Custody the fee: filer ATA -> Subaccord PDA vault.
        let before = ctx.accounts.vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.filer_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.filer.to_account_info(),
                },
            ),
            fee,
        )?;
        ctx.accounts.vault.reload()?;
        let after = ctx.accounts.vault.amount;
        let _delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let num_options = n as u8;
        let mut opt_arr = [[0u8; 32]; MAX_OPTIONS];
        for (i, o) in options.iter().enumerate() {
            opt_arr[i] = *o;
        }

        let d = &mut ctx.accounts.dispute;
        d.subaccord = sub.key();
        d.filer = ctx.accounts.filer.key();
        d.nonce = nonce;
        d.num_options = num_options;
        d.options = opt_arr;
        d.evidence_hash = evidence_hash;
        d.state = DisputeState::Created;
        d.current_round = 0;
        d.final_ruling = None;
        d.fee_paid = fee;
        d.bump = ctx.bumps.dispute;

        emit!(DisputeCreated {
            dispute: d.key(),
            subaccord: sub.key(),
            filer: ctx.accounts.filer.key(),
            num_options,
        });
        Ok(())
    }

    /// Off-chain indexer posts the Merkle root over the Subaccord's Juror set +
    /// cumulative stakes (ADR-0003). Permissionless + bonded: the poster
    /// transfers `1 × max-appeal-fee` (the largest possible appeal-round panel ·
    /// `fee_per_juror`) into the vault, forfeited if a fraud proof lands within
    /// the 1-day window. Sets the dispute to `SnapshotPosted` and arms the
    /// challenge deadline. One snapshot per round (`init`); re-posting after a
    /// void is a deferred concern (the dispute stalls, poster loses bond).
    pub fn post_snapshot(
        ctx: Context<PostSnapshot>,
        merkle_root: [u8; 32],
        total_stake: u64,
    ) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Created,
            AccordError::InvalidState
        );

        let sub = &ctx.accounts.subaccord;
        let max_panel = max_appeal_panel_size(sub.jurors_per_dispute, sub.max_appeals)?;
        let bond = (max_panel as u64)
            .checked_mul(sub.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Custody the bond: poster ATA -> Subaccord PDA vault.
        let before = ctx.accounts.vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.poster_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.poster.to_account_info(),
                },
            ),
            bond,
        )?;
        ctx.accounts.vault.reload()?;
        let after = ctx.accounts.vault.amount;
        let _delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let now = Clock::get()?.unix_timestamp;
        let deadline = now
            .checked_add(SNAPSHOT_CHALLENGE_WINDOW_SECS)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let round_idx = dispute.current_round;
        let snap = &mut ctx.accounts.snapshot;
        snap.dispute = dispute.key();
        snap.round_idx = round_idx;
        snap.merkle_root = merkle_root;
        snap.poster = ctx.accounts.poster.key();
        snap.bond = bond;
        snap.challenge_deadline = deadline;
        snap.status = SnapshotStatus::Posted;
        snap.anchor_slot = Clock::get()?.slot;
        snap.total_stake = total_stake;
        snap.bump = ctx.bumps.snapshot;

        dispute.state = DisputeState::SnapshotPosted;

        emit!(SnapshotPosted {
            dispute: dispute.key(),
            round_idx,
            merkle_root,
            poster: ctx.accounts.poster.key(),
        });
        Ok(())
    }

    /// Contest a posted Snapshot root within the 1-day fraud-proof window
    /// (ADR-0003). The challenger bonds an equal amount, then the on-chain
    /// Verifier decides: a valid [`FraudProof`] (duplicate Juror across two
    /// verifiable leaves) voids the root and sends the poster's bond to the
    /// challenger; anything else is a false challenge and the challenger's bond
    /// goes to the poster. Both bond sweeps are PDA-signed out of the vault —
    /// the program is the sweep authority.
    pub fn challenge_snapshot(ctx: Context<ChallengeSnapshot>, proof: FraudProof) -> Result<()> {
        let snap = &mut ctx.accounts.snapshot;
        require!(
            snap.status == SnapshotStatus::Posted,
            AccordError::InvalidState
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now <= snap.challenge_deadline,
            AccordError::SnapshotChallengeWindowExpired
        );

        let bond = snap.bond;
        let sub = &ctx.accounts.subaccord;

        // Challenger posts an equal bond into custody first.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.challenger_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.challenger.to_account_info(),
                },
            ),
            bond,
        )?;

        let root_hash = snap.merkle_root;
        let total_stake = snap.total_stake;
        let anchor_slot = snap.anchor_slot;
        let sub_key = sub.key();
        let challenger_key = ctx.accounts.challenger.key();

        // ADR-0008/0009: fraud predicate dispatch.
        let fraud = match &proof {
            FraudProof::Duplicate {
                leaf_a,
                proof_a,
                index_a,
                leaf_b,
                proof_b,
                index_b,
            } => {
                *index_a != *index_b
                    && verify_mst_inclusion(leaf_a, *index_a, proof_a, root_hash, total_stake)
                    && verify_mst_inclusion(leaf_b, *index_b, proof_b, root_hash, total_stake)
                    && leaf_a.juror == leaf_b.juror
            }
            FraudProof::WrongStake { leaf, proof, index } => {
                if !verify_mst_inclusion(leaf, *index, proof, root_hash, total_stake) {
                    false
                } else {
                    require!(
                        !ctx.remaining_accounts.is_empty(),
                        AccordError::InvalidMembershipProof
                    );
                    let js_info = &ctx.remaining_accounts[0];
                    let expected_pda = Pubkey::find_program_address(
                        &[SEED_JUROR_STAKE, sub_key.as_ref(), leaf.juror.as_ref()],
                        &crate::ID,
                    )
                    .0;
                    require!(
                        js_info.key == &expected_pda,
                        AccordError::InvalidMembershipProof
                    );
                    let js_data = js_info.try_borrow_data()?;
                    let js = JurorStake::try_deserialize(&mut &js_data[..])?;
                    js.last_change_slot < anchor_slot && js.amount != leaf.stake
                }
            }
            FraudProof::NotSorted {
                leaf_lo,
                proof_lo,
                index_lo,
                leaf_hi,
                proof_hi,
                index_hi,
            } => {
                // Both leaves verify against the root.
                verify_mst_inclusion(leaf_lo, *index_lo, proof_lo, root_hash, total_stake)
                    && verify_mst_inclusion(leaf_hi, *index_hi, proof_hi, root_hash, total_stake)
                    // lo comes before hi in the tree but has a HIGHER pubkey.
                    && *index_lo < *index_hi
                    && leaf_lo.juror > leaf_hi.juror
            }
            FraudProof::Omission {
                leaf_lo,
                proof_lo,
                index_lo,
                leaf_hi,
                proof_hi,
                index_hi,
            } => {
                // Both leaves verify against the root.
                if !verify_mst_inclusion(leaf_lo, *index_lo, proof_lo, root_hash, total_stake)
                    || !verify_mst_inclusion(leaf_hi, *index_hi, proof_hi, root_hash, total_stake)
                {
                    false
                } else if *index_hi != *index_lo + 1 {
                    // Must be consecutive (no leaf between them).
                    false
                } else if !(leaf_lo.juror < challenger_key && challenger_key < leaf_hi.juror) {
                    // Challenger must fall in the gap.
                    false
                } else {
                    // Witness: challenger's JurorStake was staked at anchor time.
                    require!(
                        !ctx.remaining_accounts.is_empty(),
                        AccordError::InvalidMembershipProof
                    );
                    let js_info = &ctx.remaining_accounts[0];
                    let expected_pda = Pubkey::find_program_address(
                        &[SEED_JUROR_STAKE, sub_key.as_ref(), challenger_key.as_ref()],
                        &crate::ID,
                    )
                    .0;
                    require!(
                        js_info.key == &expected_pda,
                        AccordError::InvalidMembershipProof
                    );
                    let js_data = js_info.try_borrow_data()?;
                    let js = JurorStake::try_deserialize(&mut &js_data[..])?;
                    js.last_change_slot < anchor_slot && js.amount > 0
                }
            }
        };

        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];

        if fraud {
            // Poster forfeits: poster's original bond + the challenger's bond both
            // sweep to the challenger (net +bond to challenger, -bond to poster).
            let payout = bond
                .checked_add(bond)
                .ok_or(AccordError::ArithmeticOverflow)?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.challenger_token_account.to_account_info(),
                        authority: ctx.accounts.subaccord.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                payout,
            )?;
            snap.status = SnapshotStatus::Voided;
            emit!(SnapshotChallenged {
                dispute: snap.dispute,
                round_idx: snap.round_idx,
                challenger: ctx.accounts.challenger.key(),
            });
        } else {
            // False challenge: the challenger's bond sweeps to the poster. The
            // poster's original bond stays held in custody (returned on
            // finalize). The Snapshot remains Posted — the window is still open.
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.poster_token_account.to_account_info(),
                        authority: ctx.accounts.subaccord.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                bond,
            )?;
        }

        Ok(())
    }

    /// Permissionless crank: once the 1-day challenge window passes unchallenged,
    /// the root is trustworthy. Returns the poster's bond and marks the Snapshot
    /// `Finalized` so `draw` may consume it. A voided root can never finalize.
    pub fn finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
        let snap = &mut ctx.accounts.snapshot;
        require!(
            snap.status == SnapshotStatus::Posted,
            AccordError::InvalidState
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= snap.challenge_deadline,
            AccordError::SnapshotChallengeWindowOpen
        );

        let bond = snap.bond;
        let sub = &ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.poster_token_account.to_account_info(),
                    authority: ctx.accounts.subaccord.to_account_info(),
                },
                &[signer_seeds],
            ),
            bond,
        )?;

        snap.status = SnapshotStatus::Finalized;
        emit!(SnapshotFinalized {
            dispute: snap.dispute,
            round_idx: snap.round_idx,
        });
        Ok(())
    }

    // --- Draw (ADR-0003/0009; veridao-fr1x/veridao-4nyi) ------------------------

    /// Commit the VRF result for a dispute's draw (ADR-0009). One-shot:
    /// stores `dispute.committed_vrf`, which `draw` reads immutably. Must be
    /// called after `finalize_snapshot` and before `draw`. Permissionless —
    /// any caller may commit. The VRF result is caller-supplied until the
    /// magicblock VRF integration lands (bean veridao-utcu); this instruction
    /// ensures the result can't be swapped between draw retries.
    pub fn commit_vrf(ctx: Context<CommitVrf>, vrf_result: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.committed_vrf.is_none(),
            AccordError::VrfAlreadyCommitted
        );
        require!(
            ctx.accounts.snapshot.status == SnapshotStatus::Finalized,
            AccordError::SnapshotNotFinalized
        );
        dispute.committed_vrf = Some(vrf_result);
        emit!(VrfCommitted {
            dispute: dispute.key(),
            vrf_result,
        });
        Ok(())
    }

    /// Select N distinct Jurors from the finalized Snapshot, weighted by stake,
    /// via the committed VRF (ADR-0003/0009). Permissionless: any cranker
    /// submits `draw_attempt` + the membership proofs for the VRF-selected
    /// jurors.
    ///
    /// The on-chain program verifies: snapshot is finalized, VRF is committed,
    /// each MST membership proof (hash + sum + cum_after consistency), the
    /// sortition criterion (`cum_before ≤ r_i < cum_after` where `r_i` is
    /// deterministically derived from the VRF seed + slot index), stake ≥
    /// `min_stake`, `JurorStake.amount ≥ leaf.stake` (inflation guard), and all
    /// jurors distinct. On collision (same juror drawn twice), the instruction
    /// reverts; the cranker retries with `draw_attempt + 1` (same committed VRF).
    pub fn draw(
        ctx: Context<Draw>,
        draw_attempt: u32,
        memberships: Vec<JurorMembership>,
    ) -> Result<()> {
        let snap = &ctx.accounts.snapshot;
        require!(
            snap.status == SnapshotStatus::Finalized,
            AccordError::SnapshotNotFinalized
        );

        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::SnapshotPosted,
            AccordError::InvalidState
        );

        let sub = &ctx.accounts.subaccord;
        let round_idx = dispute.current_round;
        let panel = panel_size_for_round(sub.jurors_per_dispute, round_idx)?;

        require!(
            memberships.len() <= MAX_JURORS,
            AccordError::InvalidPanelSize
        );
        require!(
            memberships.len() == panel as usize,
            AccordError::InvalidPanelSize
        );

        // Read committed VRF (ADR-0009: commit_vrf stores it; draw reads it).
        let committed_vrf = dispute.committed_vrf.ok_or(AccordError::VrfNotCommitted)?;

        // VRF seed: deterministic, binds committed VRF + dispute + round + attempt.
        let vrf_seed = {
            use solana_program::hash::hashv;
            hashv(&[
                &committed_vrf,
                dispute.key().as_ref(),
                &round_idx.to_le_bytes(),
                &draw_attempt.to_le_bytes(),
            ])
            .to_bytes()
        };

        // Verify each MST membership proof + stake eligibility + sortition.
        let root_hash = snap.merkle_root;
        let total_stake = snap.total_stake;
        let mut drawn: Vec<Pubkey> = Vec::with_capacity(panel as usize);
        for (i, m) in memberships.iter().enumerate() {
            require!(
                m.leaf.juror != Pubkey::default(),
                AccordError::InvalidMembershipProof
            );
            require!(
                m.leaf.stake >= sub.min_stake,
                AccordError::InsufficientStake
            );
            require!(
                verify_mst_inclusion(&m.leaf, m.index, &m.proof, root_hash, total_stake),
                AccordError::InvalidMembershipProof
            );
            // ADR-0009 sortition enforcement: r_i is deterministically derived
            // from the VRF seed + slot index. The submitted leaf's cumulative
            // range must contain r_i — the caller cannot cherry-pick.
            let r_hash = {
                use solana_program::hash::hashv;
                hashv(&[&vrf_seed, &(i as u32).to_le_bytes()]).to_bytes()
            };
            let r_i = u64::from_le_bytes(r_hash[0..8].try_into().unwrap_or([0u8; 8])) % total_stake;
            let cum_before = m.leaf.cum_after.saturating_sub(m.leaf.stake);
            require!(
                cum_before <= r_i && r_i < m.leaf.cum_after,
                AccordError::SortitionMismatch
            );
            drawn.push(m.leaf.juror);
        }

        // Distinctness: O(N²), N ≤ 31 — no hash map on-chain.
        for i in 0..drawn.len() {
            for j in (i + 1)..drawn.len() {
                require!(drawn[i] != drawn[j], AccordError::DuplicateJuror);
            }
        }

        // Verify + mutate each drawn Juror's JurorStake (remaining_accounts).
        require!(
            ctx.remaining_accounts.len() == panel as usize,
            AccordError::InvalidPanelSize
        );
        let dispute_key = dispute.key();
        let sub_key = sub.key();
        for (i, acct_info) in ctx.remaining_accounts.iter().enumerate() {
            let expected_juror = drawn[i];
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), expected_juror.as_ref()],
                &crate::ID,
            )
            .0;
            require!(
                acct_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );

            // Deserialize to verify discriminator + juror field matches.
            let current = {
                let data = acct_info.try_borrow_data()?;
                let js = JurorStake::try_deserialize(&mut &data[..])?;
                require!(
                    js.juror == expected_juror,
                    AccordError::InvalidMembershipProof
                );
                // ADR-0008 predicate 4: inflation guard. The leaf may understate
                // or match, never overstate. Catches attacker-inflated leaves
                // regardless of the TOCTOU race (reads live state, not anchor).
                require!(
                    js.amount >= memberships[i].leaf.stake,
                    AccordError::InflatedStake
                );
                js.active_draws
            };

            // Patch active_draws directly (avoids full re-serialize; BPF-safe).
            // Layout: 8 (disc) + 32 (subaccord) + 32 (juror) + 8 (amount).
            let new_val = current
                .checked_add(1)
                .ok_or(AccordError::ArithmeticOverflow)?;
            let mut data = acct_info.try_borrow_mut_data()?;
            const ACTIVE_DRAWS_OFFSET: usize = 8 + 32 + 32 + 8;
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&new_val.to_le_bytes());
        }

        // Record jurors in the Round (zero-copy: load_init writes discriminator).
        let now_ts = Clock::get()?.unix_timestamp;
        let review_end = now_ts
            .checked_add(sub.review_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let commit_end = review_end
            .checked_add(sub.commit_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let reveal_end = commit_end
            .checked_add(sub.reveal_window as i64)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let mut round = ctx.accounts.round.load_init()?;
        round.dispute = dispute_key;
        round.round_idx = round_idx;
        round.review_end = review_end;
        round.commit_end = commit_end;
        round.reveal_end = reveal_end;
        for (i, juror) in drawn.iter().enumerate() {
            round.jurors[i] = *juror;
        }
        round.juror_count = panel;
        round.commit_count = 0;
        round.reveal_count = 0;
        round.result = u8::MAX; // sentinel: not set
        round.reveals = [u8::MAX; MAX_JURORS]; // sentinel: not revealed
        round.bump = ctx.bumps.round;

        // Transition dispute → Drawn.
        dispute.state = DisputeState::Drawn;

        emit!(JurorsDrawn {
            dispute: dispute_key,
            round_idx,
            jurors: drawn,
            vrf_seed,
        });
        Ok(())
    }

    // --- Voting & Ruling (veridao-pq1s) ---------------------------------------

    /// Commit a vote hash. `h = hash(vote_le ‖ salt ‖ juror_pubkey)` — the
    /// juror's pubkey is bound into the hash to prevent commit-copying (a juror
    /// who copies another's hash can never reveal it). One per drawn Juror;
    /// immutable after commit. Allowed during the commit window
    /// (`review_end ≤ now < commit_end`).
    pub fn commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn || dispute.state == DisputeState::Commit,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.review_end, AccordError::CommitWindowClosed);
        require!(now < round.commit_end, AccordError::CommitWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        require!(
            round.commits[idx] == [0u8; 32],
            AccordError::CommitAlreadyExists
        );
        round.commits[idx] = commitment;
        round.commit_count = round
            .commit_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Drawn {
            dispute.state = DisputeState::Commit;
        }

        emit!(Committed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
        });
        Ok(())
    }

    /// Reveal a committed vote. Verifies `hash(vote_le ‖ salt ‖ juror_pubkey)`
    /// matches the stored commit, then records the vote. Allowed during the
    /// reveal window (`commit_end ≤ now < reveal_end`). Jurors who committed
    /// but do not reveal are penalized ≥ incoherent at finalization.
    pub fn reveal(ctx: Context<Reveal>, vote: u8, salt: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Commit || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        require!(vote < dispute.num_options, AccordError::InvalidVote);

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.commit_end, AccordError::RevealWindowClosed);
        require!(now < round.reveal_end, AccordError::RevealWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        let committed = round.commits[idx];
        require!(committed != [0u8; 32], AccordError::CommitMissing);
        require!(round.reveals[idx] == u8::MAX, AccordError::AlreadyRevealed);

        use solana_program::hash::hashv;
        let computed = hashv(&[&[vote], &salt, juror_key.as_ref()]).to_bytes();
        require!(computed == committed, AccordError::RevealMismatch);

        round.reveals[idx] = vote;
        round.reveal_count = round
            .reveal_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Commit {
            dispute.state = DisputeState::Reveal;
        }

        emit!(Revealed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
            vote,
        });
        Ok(())
    }

    /// Permissionless crank: after the reveal window elapses, tallies the
    /// round by plurality and transitions to `RoundResolved`. Handles all
    /// active states (Drawn/Commit/Reveal) — if no one committed or revealed,
    /// the result defaults to option 0.
    pub fn finalize_round(ctx: Context<FinalizeRound>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn
                || dispute.state == DisputeState::Commit
                || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.reveal_end, AccordError::RoundNotFinalizable);

        let mut counts = [0u32; MAX_OPTIONS];
        for i in 0..round.juror_count as usize {
            let v = round.reveals[i];
            if v != u8::MAX && (v as usize) < MAX_OPTIONS {
                counts[v as usize] += 1;
            }
        }

        let winner = (0..dispute.num_options as usize)
            .max_by_key(|&i| counts[i])
            .unwrap_or(0) as u8;
        round.result = winner;

        dispute.state = DisputeState::RoundResolved;

        emit!(RoundResolved {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            result: winner,
        });
        Ok(())
    }

    /// Permissionless crank: once the appeal window elapses without an appeal,
    /// settles the final round's economics and writes the ruling. Pure ledger
    /// accounting — the tokens are already in the vault, so no SPL transfers
    /// are needed:
    ///
    /// 1. Determine coherence (revealed vote == final ruling).
    /// 2. Slash each incoherent/non-revealing juror: `α · min_stake`.
    /// 3. Pool = slash_total + round_fee (`panel · fee_per_juror`).
    /// 4. Equal split of pool among coherent jurors (integer div; remainder
    ///    stays in vault as protocol surplus).
    /// 5. Decrement `active_draws` for ALL drawn jurors (unfreezes stake).
    /// 6. Write `final_ruling` and transition to `Final`.
    ///
    /// Drawn `JurorStake` accounts are passed as `remaining_accounts`, verified
    /// against the round's juror list + PDA derivation (same pattern as `draw`).
    pub fn finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let round = ctx.accounts.round.load()?;
        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(APPEAL_WINDOW_SECS)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now >= appeal_deadline, AccordError::AppealWindowOpen);

        let final_ruling = round.result;
        require!(final_ruling != u8::MAX, AccordError::InvalidState);

        let sub = &ctx.accounts.subaccord;
        let panel = round.juror_count as usize;
        // remaining_accounts = [juror_stake PDAs (panel)] + [AppealBond PDAs
        // (one per appeal == `current_round`)]. With no appeals this collapses
        // to just the juror stakes (backward-compatible single-round path).
        let appeal_n = dispute.current_round as usize;
        require!(
            ctx.remaining_accounts.len() == panel + appeal_n,
            AccordError::InvalidPanelSize
        );

        let slash_per_juror = (sub.alpha_bps as u64)
            .checked_mul(sub.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;

        // --- First pass: verify PDAs + compute coherence stats ---
        let mut coherent_count: u32 = 0;
        let mut slash_total: u64 = 0;
        let sub_key = sub.key();
        for i in 0..panel {
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
                &crate::ID,
            )
            .0;
            require!(
                ctx.remaining_accounts[i].key == &expected_pda,
                AccordError::InvalidMembershipProof
            );

            let is_coherent = round.reveals[i] != u8::MAX && round.reveals[i] == final_ruling;
            if is_coherent {
                coherent_count += 1;
            } else {
                slash_total = slash_total
                    .checked_add(slash_per_juror)
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }
        }

        // --- Appeal bond forfeiture (ADR-0004) ---
        // Each AppealBond PDA is keyed by the round it appealed (0..current_round).
        // No flip (`prior_result == final_ruling`) => fold the bond into the
        // final-round coherent pool and consume it (zero the on-chain amount).
        // Flip (`prior_result != final_ruling`) => leave the bond for
        // `claim_appeal_refund` to return to the appellant.
        let dispute_key = dispute.key();
        let mut forfeited_total: u64 = 0;
        // AppealBond layout: disc(8) + dispute(32) + round_idx(4) + appellant(32)
        // => amount @ 76 (u64), prior_result @ 84 (u8).
        const BOND_AMOUNT_OFFSET: usize = 8 + 32 + 4 + 32;
        const BOND_PRIOR_OFFSET: usize = BOND_AMOUNT_OFFSET + 8;
        for i in 0..appeal_n {
            let expected_pda = Pubkey::find_program_address(
                &[
                    SEED_APPEAL_BOND,
                    dispute_key.as_ref(),
                    &(i as u32).to_le_bytes(),
                ],
                &crate::ID,
            )
            .0;
            let bond_info = &ctx.remaining_accounts[panel + i];
            require!(
                bond_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            let (amount, prior_result) = {
                let d = bond_info.try_borrow_data()?;
                require!(
                    d.len() >= BOND_PRIOR_OFFSET + 1,
                    AccordError::InvalidMembershipProof
                );
                let amt = u64::from_le_bytes(
                    d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                (amt, d[BOND_PRIOR_OFFSET])
            };
            if prior_result == final_ruling {
                // No flip: forfeit into the coherent pool and consume the bond.
                forfeited_total = forfeited_total
                    .checked_add(amount)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                let mut d = bond_info.try_borrow_mut_data()?;
                d[BOND_AMOUNT_OFFSET..BOND_AMOUNT_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
            }
        }

        let round_fee = (panel as u64)
            .checked_mul(sub.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let pool = slash_total
            .checked_add(round_fee)
            .and_then(|v| v.checked_add(forfeited_total))
            .ok_or(AccordError::ArithmeticOverflow)?;
        let share = if coherent_count > 0 {
            pool / coherent_count as u64
        } else {
            0 // no coherent jurors: pool stays in vault (SPEC §4.6 fn.10, flagged)
        };

        // --- Second pass: apply slashes + redistributions + decrement draws ---
        const AMOUNT_OFFSET: usize = 8 + 32 + 32; // disc + subaccord + juror
        const ACTIVE_DRAWS_OFFSET: usize = AMOUNT_OFFSET + 8;

        for i in 0..panel {
            let acct_info = &ctx.remaining_accounts[i];
            let is_coherent = round.reveals[i] != u8::MAX && round.reveals[i] == final_ruling;

            let (amount, active_draws) = {
                let data = acct_info.try_borrow_data()?;
                if data.len() < ACTIVE_DRAWS_OFFSET + 4 {
                    return Err(AccordError::InvalidMembershipProof.into());
                }
                let amt =
                    u64::from_le_bytes(data[AMOUNT_OFFSET..AMOUNT_OFFSET + 8].try_into().unwrap());
                let draws = u32::from_le_bytes(
                    data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                        .try_into()
                        .unwrap(),
                );
                (amt, draws)
            };

            let new_amount = if is_coherent {
                amount
                    .checked_add(share)
                    .ok_or(AccordError::ArithmeticOverflow)?
            } else {
                amount.checked_sub(slash_per_juror.min(amount)).unwrap_or(0)
            };
            let new_draws = active_draws.saturating_sub(1);

            let mut data = acct_info.try_borrow_mut_data()?;
            data[AMOUNT_OFFSET..AMOUNT_OFFSET + 8].copy_from_slice(&new_amount.to_le_bytes());
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&new_draws.to_le_bytes());
        }

        // Flipped appeal bonds stay in the vault post-finalization and are
        // returned to their appellants by the permissionless `claim_appeal_refund`
        // crank (ADR-0004). Forfeited (no-flip) bonds were already folded into
        // the coherent pool above.

        dispute.final_ruling = Some(final_ruling);
        dispute.state = DisputeState::Final;

        emit!(RulingFinalized {
            dispute: dispute.key(),
            ruling: final_ruling,
        });
        Ok(())
    }

    /// **Permissionless** appeal (ADR-0004): anyone may escalate a resolved
    /// round to a larger panel. The appellant deposits the new round's juror
    /// fee (`N_new · fee_per_juror`) plus an appeal bond (== the new round fee;
    /// forfeited to the final round's coherent jurors if the appeal fails to
    /// flip the prior ruling, returned if it flips). Opens a fresh round at
    /// `2N+1` by incrementing `current_round` and resetting the dispute to
    /// `Created` so the snapshot → draw → vote cycle reruns for the new panel.
    /// Custodies the bond in a per-appeal `AppealBond` PDA.
    ///
    /// Gates: `RoundResolved` state, within the appeal window, under the
    /// `max_appeals` cap, and with enough active distinct stakers to fill the
    /// larger panel. Reverts while the program is paused.
    pub fn appeal(ctx: Context<Appeal>) -> Result<()> {
        require!(!ctx.accounts.pause_state.paused, AccordError::ProgramPaused);

        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RoundResolved,
            AccordError::InvalidState
        );

        let sub = &ctx.accounts.subaccord;
        // Cap: `current_round` is the round just resolved. Appealing opens round
        // `current_round + 1`, i.e. appeal number `current_round + 1`. The
        // number of appeals must not exceed `max_appeals`.
        require!(
            dispute.current_round < u32::from(sub.max_appeals),
            AccordError::MaxAppealsReached
        );

        let round = ctx.accounts.round.load()?;
        let prior_result = round.result;
        require!(prior_result != u8::MAX, AccordError::InvalidState);

        let now = Clock::get()?.unix_timestamp;
        let appeal_deadline = round
            .reveal_end
            .checked_add(APPEAL_WINDOW_SECS)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now < appeal_deadline, AccordError::AppealWindowClosed);

        // New panel = 2N+1 (closed form `(J+1)·2^k − 1`, capped at MAX_JURORS).
        let new_round = dispute
            .current_round
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let panel_new = panel_size_for_round(sub.jurors_per_dispute, new_round)?;
        require!(
            sub.staker_count >= panel_new,
            AccordError::InsufficientJurors
        );

        // Exponential cost: new-round fee + appeal bond (bond == new-round fee).
        let fee_new = (panel_new as u64)
            .checked_mul(sub.fee_per_juror)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let bond = fee_new;
        let total = fee_new
            .checked_add(bond)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Custody fee + bond: appellant ATA -> Subaccord PDA vault.
        let before = ctx.accounts.vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.appellant_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.appellant.to_account_info(),
                },
            ),
            total,
        )?;
        ctx.accounts.vault.reload()?;
        let after = ctx.accounts.vault.amount;
        let _delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Record the appeal bond in its own PDA for settlement. `prior_result`
        // captures the ruling the appellant seeks to flip (the just-resolved
        // round's winner); flip detection at `finalize_dispute` compares it
        // against the final ruling.
        let bond_acc = &mut ctx.accounts.appeal_bond;
        bond_acc.dispute = dispute.key();
        bond_acc.round_idx = new_round;
        bond_acc.appellant = ctx.accounts.appellant.key();
        bond_acc.amount = bond;
        bond_acc.prior_result = prior_result;
        bond_acc.bump = ctx.bumps.appeal_bond;

        dispute.fee_paid = dispute
            .fee_paid
            .checked_add(fee_new)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Open the new round: bump `current_round` and reset to `Created` so the
        // snapshot → draw → vote cycle reruns for the larger panel.
        dispute.current_round = new_round;
        dispute.state = DisputeState::Created;

        emit!(Appealed {
            dispute: dispute.key(),
            new_round_idx: new_round,
            appellant: ctx.accounts.appellant.key(),
            bond,
        });
        Ok(())
    }

    /// Permissionless crank that returns a flipped appeal bond to its appellant
    /// after the dispute is finalized (ADR-0004: bond returned if the appeal
    /// flipped the prior ruling). `round_idx` selects which appeal's bond to
    /// claim (the round that was current when the appeal was filed). The handler
    /// verifies the `AppealBond` belongs to the destination ATA's owner, that the
    /// bond is still outstanding (`amount > 0` — `finalize_dispute` zeroes
    /// no-flip bonds), and PDA-signs the vault → ATA refund before zeroing the
    /// bond (idempotent).
    pub fn claim_appeal_refund(ctx: Context<ClaimAppealRefund>, round_idx: u32) -> Result<()> {
        let _ = round_idx; // consumed by the `#[instruction]` PDA seeds
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Final,
            AccordError::InvalidState
        );

        let bond_acc = &ctx.accounts.appeal_bond;
        require!(
            bond_acc.appellant == ctx.accounts.claimant_token_account.owner,
            AccordError::InvalidMembershipProof
        );
        let amount = bond_acc.amount;
        require!(amount > 0, AccordError::InvalidAmount);

        let sub = &ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.risk_type.as_ref(),
            &bump,
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.claimant_token_account.to_account_info(),
                    authority: ctx.accounts.subaccord.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;

        // Mark claimed (idempotent): no double-refund on re-invocation.
        ctx.accounts.appeal_bond.amount = 0;

        Ok(())
    }

    /// Read-only: returns the dispute's `final_ruling`. The Arbitrable calls
    /// this via CPI to lazily read the outcome. Returns `None` until the
    /// dispute reaches `Final`.
    pub fn get_ruling(ctx: Context<GetRuling>) -> Result<Option<u8>> {
        Ok(ctx.accounts.dispute.final_ruling)
    }
}

// --- Snapshot helpers (ADR-0003; veridao-rrxs) -------------------------------

/// Largest possible appeal-round panel for a Subaccord. The appeal ladder is
/// `N_{k+1} = 2·N_k + 1` (closed form `(J+1)·2^k − 1`), so the panel after
/// `max_appeals` appeals is `(jurors_per_dispute + 1) · 2^max_appeals − 1`,
/// capped at `MAX_JURORS` (the 3rd-appeal ceiling of 31). This drives the
/// snapshot bond (`1 × max-appeal-fee`).
fn max_appeal_panel_size(jurors_per_dispute: u32, max_appeals: u8) -> Result<u32> {
    // 2^max_appeals; v1 caps max_appeals at 3 (→ 31). Reject pathologically large
    // values rather than silently capping a misconfigured Subaccord.
    let shifts = u32::from(max_appeals);
    if shifts >= 31 {
        return Err(AccordError::ArithmeticOverflow.into());
    }
    let factor = 1u32
        .checked_shl(shifts)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let panel = (jurors_per_dispute
        .checked_add(1)
        .ok_or(AccordError::ArithmeticOverflow)?)
    .checked_mul(factor)
    .ok_or(AccordError::ArithmeticOverflow)?
    .checked_sub(1)
    .ok_or(AccordError::ArithmeticOverflow)?;
    Ok(panel.min(MAX_JURORS as u32))
}

/// Required panel size for a given round index. The appeal ladder is
/// `N_{k+1} = 2·N_k + 1` (closed form `(J+1)·2^k − 1`), so round 0 = J,
/// round 1 = 2J+1, etc., capped at `MAX_JURORS` (31).
fn panel_size_for_round(jurors_per_dispute: u32, round_idx: u32) -> Result<u32> {
    if round_idx >= 31 {
        return Err(AccordError::ArithmeticOverflow.into());
    }
    let factor = 1u32
        .checked_shl(round_idx)
        .ok_or(AccordError::ArithmeticOverflow)?;
    let panel = jurors_per_dispute
        .checked_add(1)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_mul(factor)
        .ok_or(AccordError::ArithmeticOverflow)?
        .checked_sub(1)
        .ok_or(AccordError::ArithmeticOverflow)?;
    Ok(panel.min(MAX_JURORS as u32))
}

/// Verify a `LeafClaim` is included in the posted Merkle-Sum Tree root at
/// `index`. Leaf node = `H(juror ‖ stake_le ‖ cum_after_le)`; internal nodes =
/// `H(left_hash ‖ right_hash)` with `sum = left_sum + right_sum`. The proof
/// carries `(sibling_hash, sibling_sum)` at each level.
///
/// Verifies THREE things:
/// 1. Root hash matches (structural integrity).
/// 2. Root sum matches `total_stake` (stake consistency).
/// 3. `leaf.cum_after == cum_from_left + leaf.stake` (cumulative-range
///    consistency — ensures non-overlapping ranges for sortition).
///
/// `cum_from_left` is the sum of all left-subtree siblings encountered on the
/// proof path (sibling is left when the leaf is the right child at that level).
/// This equals the total stake of all leaves to the left of the target leaf.
fn verify_mst_inclusion(
    leaf: &LeafClaim,
    index: u32,
    proof: &[MSTNode],
    root_hash: [u8; 32],
    root_sum: u64,
) -> bool {
    use solana_program::hash::hashv;
    let mut acc_hash = hashv(&[
        leaf.juror.as_ref(),
        &leaf.stake.to_le_bytes(),
        &leaf.cum_after.to_le_bytes(),
    ])
    .to_bytes();
    let mut acc_sum = leaf.stake;
    let mut cum_from_left: u64 = 0;
    for (depth, sibling) in proof.iter().enumerate() {
        if depth >= 31 {
            return false;
        }
        let is_left = (index >> depth) & 1 == 0;
        if is_left {
            acc_hash = hashv(&[&acc_hash, &sibling.sibling_hash]).to_bytes();
        } else {
            acc_hash = hashv(&[&sibling.sibling_hash, &acc_hash]).to_bytes();
            // Leaf is right child → sibling is left → contributes to cum_from_left
            cum_from_left = match cum_from_left.checked_add(sibling.sibling_sum) {
                Some(v) => v,
                None => return false,
            };
        }
        acc_sum = match acc_sum.checked_add(sibling.sibling_sum) {
            Some(v) => v,
            None => return false,
        };
    }
    // Verify root hash + root sum + cum_after consistency
    acc_hash == root_hash
        && acc_sum == root_sum
        && leaf.cum_after == cum_from_left.saturating_add(leaf.stake)
}

/// Account context for `health` — the caller signs (liveness probe), no state.
#[derive(Accounts)]
pub struct Health<'info> {
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializePause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + PauseState::INIT_SPACE,
        seeds = [SEED_PAUSE],
        bump,
    )]
    pub pause_state: Account<'info, PauseState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

#[derive(Accounts)]
pub struct ProposeUnpause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

#[derive(Accounts)]
pub struct ExecuteUnpause<'info> {
    /// Any cranker pays the tx fee; no authority check on execute (ADR-0007:
    /// the notice period, not the signer, gates the unpause).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
}

/// Account context for `create_subaccord` (veridao-ek65).
///
/// `init` (not `init_if_needed`) enforces the account is fresh, giving the
/// re-init guard and namespace-capture prevention for free. The canonical bump
/// from `find_program_address` is reused and stored on the account.
#[derive(Accounts)]
#[instruction(risk_type: [u8; 32])]
pub struct CreateSubaccord<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Subaccord::INIT_SPACE,
        seeds = [SEED_SUBACCORD, creator.key().as_ref(), risk_type.as_ref()],
        bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    pub system_program: Program<'info, System>,
}

/// Account context for `stake` (veridao-ja2w).
///
/// - `subaccord` is re-derived from its stored seeds (`creator`, `risk_type`)
///   + canonical bump so a wrong/forged pool is rejected.
/// - `staking_token` is constrained to the Subaccord's declared mint.
/// - `juror_token_account` is the Juror's canonical ATA for that mint.
/// - `vault` is the **Subaccord PDA's** ATA (lazily created on first stake) so
///   the program can move funds out on `unstake` (PDA-signed).
/// - `juror_stake` is init'd on first stake, topped up thereafter
///   (`init_if_needed`); `active_draws` is never touched here.
/// - `pause_state` enforces the ADR-0007 circuit breaker.
#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    /// Circuit breaker (ADR-0007): stake reverts while paused.
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        init_if_needed,
        payer = juror,
        space = 8 + JurorStake::INIT_SPACE,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    /// Must be the Subaccord's declared staking token.
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's vault ATA; `authority` (wallet) is the Subaccord PDA.
    #[account(
        init_if_needed,
        payer = juror,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Account context for `unstake` (veridao-b2sc).
///
/// Mirror of `Stake` minus the pause account (unstake is never halted —
/// ADR-0007 traps no capital) and minus `init_if_needed`/`associated_token_program`
/// (both accounts already exist: the vault was created on first stake, the
/// `JurorStake` on first stake). The vault is the **Subaccord PDA's** ATA so the
/// program PDA-signs the transfer out.
#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's vault ATA; program PDA-signs transfers out of it.
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Account context for `propose_subaccord_update` (veridao-y63e).
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ProposeSubaccordUpdate<'info> {
    /// Must equal `subaccord.authority`; signs + pays for the PendingUpdate.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        init,
        payer = authority,
        space = 8 + PendingUpdate::INIT_SPACE,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
    pub system_program: Program<'info, System>,
}

/// Account context for `execute_subaccord_update` (veridao-y63e).
///
/// Permissionless: any caller may land the update once the timelock elapses.
/// The `PendingUpdate` is re-derived from the Subaccord + its stored nonce +
/// canonical bump, and closed on success (rent refunded to the caller).
#[derive(Accounts)]
pub struct ExecuteSubaccordUpdate<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        mut,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &pending_update.nonce.to_le_bytes()],
        bump = pending_update.bump,
        close = caller,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
}

// --- Dispute intake & Snapshot account contexts (veridao-rrxs) ---------------

/// Account context for `create_dispute` — the Arbitrable CPI entry.
///
/// `filer` is the Arbitrable (a program signer via CPI, or any wallet). The
/// dispute PDA is `["dispute", filer, nonce]` (caller-chosen nonce gives the
/// filer a private dispute namespace). The fee moves from the filer's ATA into
/// the Subaccord PDA's vault; the vault must already exist (guaranteed: the
/// `staker_count >= N` gate implies at least one prior stake created it).
#[derive(Accounts)]
#[instruction(options: Vec<[u8; 32]>, evidence_hash: [u8; 32], nonce: u64, fee: u64)]
pub struct CreateDispute<'info> {
    #[account(mut)]
    pub filer: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        init,
        payer = filer,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [SEED_DISPUTE, filer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Account context for `post_snapshot` (ADR-0003). The snapshot PDA is
/// `["snapshot", dispute, round_idx]` where `round_idx = dispute.current_round`.
#[derive(Accounts)]
pub struct PostSnapshot<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        init,
        payer = poster,
        space = 8 + Snapshot::INIT_SPACE,
        seeds = [SEED_SNAPSHOT, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub snapshot: Box<Account<'info, Snapshot>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = poster,
    )]
    pub poster_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Account context for `challenge_snapshot`. Both bond sweeps are PDA-signed
/// out of the Subaccord vault, so the program is the sweep authority. The
/// poster need not sign — `poster_token_account` is constrained to the
/// snapshot's recorded poster.
#[derive(Accounts)]
pub struct ChallengeSnapshot<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_SNAPSHOT, dispute.key().as_ref(), &snapshot.round_idx.to_le_bytes()],
        bump = snapshot.bump,
    )]
    pub snapshot: Box<Account<'info, Snapshot>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = challenger,
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    /// The snapshot poster's ATA — sweep destination on a false challenge.
    #[account(
        mut,
        token::mint = staking_token,
        token::authority = snapshot.poster,
    )]
    pub poster_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `finalize_snapshot` — permissionless crank returning the
/// poster's bond once the challenge window passes unchallenged.
#[derive(Accounts)]
pub struct FinalizeSnapshot<'info> {
    /// Any cranker; no authority check (the elapsed window is the gate).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_SNAPSHOT, dispute.key().as_ref(), &snapshot.round_idx.to_le_bytes()],
        bump = snapshot.bump,
    )]
    pub snapshot: Box<Account<'info, Snapshot>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = staking_token,
        token::authority = snapshot.poster,
    )]
    pub poster_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `commit_vrf` (ADR-0009). Permissionless: any caller
/// commits the VRF result. Requires a finalized snapshot.
#[derive(Accounts)]
pub struct CommitVrf<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        seeds = [SEED_SNAPSHOT, dispute.key().as_ref(), &snapshot.round_idx.to_le_bytes()],
        bump = snapshot.bump,
    )]
    pub snapshot: Box<Account<'info, Snapshot>>,
}

/// Account context for `draw` (ADR-0003/0009). Permissionless: any caller
/// submits `draw_attempt` + membership proofs. Reads the committed VRF from
/// the dispute. The `Round` PDA is `init`'d fresh via `AccountLoader`
/// (zero-copy). Drawn `JurorStake` accounts are passed as `remaining_accounts`.
#[derive(Accounts)]
pub struct Draw<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        seeds = [SEED_SNAPSHOT, dispute.key().as_ref(), &snapshot.round_idx.to_le_bytes()],
        bump = snapshot.bump,
    )]
    pub snapshot: Box<Account<'info, Snapshot>>,
    #[account(
        init,
        payer = caller,
        space = 8 + std::mem::size_of::<Round>(),
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    pub system_program: Program<'info, System>,
}

// --- Voting & Ruling account contexts (veridao-pq1s) --------------------------

/// Account context for `commit`. The juror signs; the round is zero-copy
/// (`AccountLoader`), re-derived from the dispute + current round.
#[derive(Accounts)]
pub struct Commit<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `reveal`. Same shape as `Commit`.
#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `finalize_round` — permissionless crank.
#[derive(Accounts)]
pub struct FinalizeRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `finalize_dispute` — permissionless crank. Drawn
/// `JurorStake` accounts are passed as `remaining_accounts` (mut), verified
/// against the round's juror list + PDA derivation inside the handler. Appeal
/// bonds are settled ledger-style here: forfeited (no-flip) bonds fold into the
/// coherent pool; flipped bonds are returned by the separate
/// `claim_appeal_refund` crank.
#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

/// Account context for `appeal` (ADR-0004). Permissionless: `appellant` is any
/// signer. The resolved round (`current_round`) is read for the appeal-window
/// deadline and the prior ruling; the fee + bond move from the appellant's ATA
/// into the vault. The bond is custodied in a per-appeal `AppealBond` PDA keyed
/// by the round being appealed (`current_round`, before it is incremented).
#[derive(Accounts)]
pub struct Appeal<'info> {
    #[account(mut)]
    pub appellant: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(seeds = [SEED_PAUSE], bump = pause_state.bump)]
    pub pause_state: Account<'info, PauseState>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The round just resolved (`dispute.current_round`) — read-only; supplies
    /// `reveal_end` for the appeal-window check and `result` (the prior ruling).
    #[account(
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    /// Per-appeal bond custody (ADR-0004). Keyed by the round being appealed.
    #[account(
        init,
        payer = appellant,
        space = 8 + AppealBond::INIT_SPACE,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = appellant,
    )]
    pub appellant_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Account context for `claim_appeal_refund` — permissionless crank returning a
/// flipped appeal bond. `round_idx` (instruction arg) selects the bond PDA
/// `["bond", dispute, round_idx]`. The refund sweep is PDA-signed out of the
/// vault into the claimant's ATA; the handler verifies the ATA belongs to the
/// bond's recorded appellant. Named accounts only (no `remaining_accounts`)
/// keeps the CPI lifetime-uniform.
#[derive(Accounts)]
#[instruction(round_idx: u32)]
pub struct ClaimAppealRefund<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    /// The specific appeal bond being claimed.
    #[account(
        mut,
        seeds = [SEED_APPEAL_BOND, dispute.key().as_ref(), &round_idx.to_le_bytes()],
        bump = appeal_bond.bump,
    )]
    pub appeal_bond: Box<Account<'info, AppealBond>>,
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    /// The appellant's ATA — sweep destination. Any caller may pass it; the
    /// handler rejects it unless its owner matches the bond's recorded appellant.
    #[account(mut, token::mint = staking_token)]
    pub claimant_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Account context for `get_ruling` — read-only CPI entry for Arbitrables.
#[derive(Accounts)]
pub struct GetRuling<'info> {
    /// Fee payer for the transaction (CPI caller or cranker).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
}

/// Emitted by `health`. Carries the program version byte.
#[event]
pub struct HealthChecked {
    pub version: u8,
}
