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
declare_id!("5DjgEFpkzXk37uENkfGptfARTEmr4aUoZXcSAXMYKzLZ");

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
                ctx.accounts.token_program.to_account_info(),
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
        // active_draws intentionally untouched: 0 on fresh init, preserved on top-up.
        js.amount = js
            .amount
            .checked_add(delta)
            .ok_or(AccordError::ArithmeticOverflow)?;

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
                ctx.accounts.token_program.to_account_info(),
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
        js.amount = js
            .amount
            .checked_sub(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;

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

/// Emitted by `health`. Carries the program version byte.
#[event]
pub struct HealthChecked {
    pub version: u8,
}
