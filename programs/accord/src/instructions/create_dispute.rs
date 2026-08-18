use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// --- Dispute intake & Snapshot account contexts (veridao-rrxs) ---------------

/// Account context for `create_dispute` — the Arbitrable CPI entry.
///
/// `filer` is the Arbitrable (a program signer via CPI, or any wallet). The
/// dispute PDA is `["dispute", filer, nonce]` (caller-chosen nonce gives the
/// filer a private dispute namespace). The fee moves from the filer's ATA into
/// the Subaccord PDA's fee_vault; the fee_vault must already exist (guaranteed: the
/// `staker_count >= N` gate implies at least one prior stake created it).
#[derive(Accounts)]
#[instruction(options: Vec<[u8; 32]>, evidence_hash: [u8; 32], nonce: u64, fee: u64)]
pub struct CreateDispute<'info> {
    #[account(mut)]
    pub filer: Signer<'info>,
    /// Rent payer for the dispute `init` + fee_vault `init_if_needed`. MUST be
    /// data-free (the system program rejects lamport transfers from
    /// data-carrying accounts), so Arbitrables whose filer is a data-carrying
    /// PDA pass their crank caller here; wallet filers pass themselves. The
    /// dispute-fee itself still flows from `filer_token_account` — this
    /// account only carries rent lamports (canon.challenge.spec BLOCKER fix).
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
    #[account(
        init,
        payer = rent_payer,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [SEED_DISPUTE, filer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    /// Subaccord PDA's fee_vault ATA (ADR-0020). Created on first dispute if
    /// it doesn't exist yet.
    #[account(
        init_if_needed,
        payer = rent_payer,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateDispute<'info> {
    pub fn handler_create_dispute(
        ctx: Context<CreateDispute>,
        options: Vec<[u8; 32]>,
        evidence_hash: [u8; 32],
        nonce: u64,
        fee: u64,
    ) -> Result<()> {
        require!(
            !ctx.accounts.accord_state.paused,
            AccordError::ProgramPaused
        );
        // Options gate (ADR-0025): Plurality disputes enumerate 2..=MAX_OPTIONS
        // option hashes; Median (scalar) disputes file with none — the vote is
        // a u64 fixed-point value, not an index.
        let n = options.len();
        match ctx.accounts.subaccord.aggregation {
            Aggregation::Plurality => {
                require!((2..=MAX_OPTIONS).contains(&n), AccordError::InvalidOptions);
            }
            Aggregation::Median => {
                require!(n == 0, AccordError::InvalidOptions);
            }
        }
        let sub = &mut ctx.accounts.subaccord;
        let required_fee = sub.filing_fee()?;
        require!(fee == required_fee, AccordError::FeeMismatch);

        require!(
            sub.staker_count >= sub.min_jury_size,
            AccordError::InsufficientJurors
        );

        // Custody the fee: filer ATA -> Subaccord PDA fee_vault (ADR-0020).
        let before = ctx.accounts.fee_vault.amount;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.filer_token_account.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.filer.to_account_info(),
                },
            ),
            fee,
        )?;
        ctx.accounts.fee_vault.reload()?;
        let after = ctx.accounts.fee_vault.amount;
        let delta = after
            .checked_sub(before)
            .ok_or(AccordError::ArithmeticOverflow)?;
        sub.fee_vault_deposited = sub
            .fee_vault_deposited
            .checked_add(delta)
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
        d.evidence_hashes[0] = evidence_hash;
        d.state = DisputeState::Created;
        d.current_round = 0;
        d.final_ruling = u64::MAX;
        d.finalized_at = 0;
        d.fee_paid = fee;
        // Ugly 4: record the filing timestamp so cancel_dispute has a pre-draw
        // anchor (snapshot/VRF liveness backstop).
        d.filed_at = Clock::get()?.unix_timestamp;
        // Ugly 6: freeze the economics-relevant params at filing time so the
        // 48h timelock (ADR-0005) cannot shift slashing/fees/panel/windows
        // mid-dispute. All later instructions read `d.terms`, never live `sub`.
        d.terms = CaseTerms {
            alpha_bps: sub.alpha_bps,
            min_stake: sub.min_stake,
            fee_per_juror: sub.fee_per_juror,
            review_window: sub.review_window,
            commit_window: sub.commit_window,
            reveal_window: sub.reveal_window,
            appeal_window: sub.appeal_window,
            max_appeals: sub.max_appeals,
            min_jury_size: sub.min_jury_size,
            aggregation: sub.aggregation,
            reveal_threshold_bps: sub.reveal_threshold_bps,
            shortfall_policy: sub.shortfall_policy,
            max_draw_attempts: sub.max_draw_attempts,
            coherence_tol_bps: sub.coherence_tol_bps,
        };
        d.bump = ctx.bumps.dispute;

        emit!(DisputeCreated {
            dispute: d.key(),
            subaccord: sub.key(),
            filer: ctx.accounts.filer.key(),
            num_options,
        });
        Ok(())
    }
}
