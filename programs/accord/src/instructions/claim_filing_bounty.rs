use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `claim_filing_bounty` (ADR-0030) — permissionless crank
/// refunding the filer's flip-bounty unit when a dispute finalized without
/// ever being appealed. Named accounts only (no `remaining_accounts`) keeps
/// the CPI lifetime-uniform — same shape as `claim_appeal_refund`.
#[derive(Accounts)]
pub struct ClaimFilingBounty<'info> {
    /// Any cranker; the dispute's terminal state is the gate.
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// The filer's ATA — sweep destination. Any caller may pass it; Anchor's
    /// ATA constraint pins it to `dispute.filer`.
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = dispute.filer,
    )]
    pub filer_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimFilingBounty<'info> {
    pub fn handler_claim_filing_bounty(ctx: Context<ClaimFilingBounty>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        // Terminal gate: only a Final dispute pays the filer bounty, and only
        // when no appeal ever happened (`current_round == 0`) — any appeal
        // consumed the pool at `finalize_dispute` (aligned-flipper shares or
        // the no-flip `pool_extra` roll-up). The Failed path refunds the
        // filer's unit inside its own refund transfer and zeroes the pool, so
        // `bounty_pool > 0` here implies the Final/no-appeal shape.
        require!(
            dispute.state == DisputeState::Final && dispute.current_round == 0,
            AccordError::InvalidState
        );
        let bounty = dispute.bounty_pool;
        require!(bounty > 0, AccordError::InvalidAmount);

        let sub = &mut ctx.accounts.subaccord;
        let bump = [sub.bump];
        let signer_seeds = &[
            SEED_SUBACCORD,
            sub.creator.as_ref(),
            sub.domain_ref.as_ref(),
            &bump,
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.filer_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            bounty,
        )?;

        // Parallel vault ledger (bean accord-fdad): track the bounty refund out.
        sub.fee_vault_withdrawn = sub
            .fee_vault_withdrawn
            .checked_add(bounty)
            .ok_or(AccordError::ArithmeticOverflow)?;

        // Mark claimed (idempotent): zero-on-claim, same pattern as the bond.
        dispute.bounty_pool = 0;

        emit!(FilingBountyClaimed {
            dispute: dispute.key(),
            filer: dispute.filer,
            amount: bounty,
        });
        Ok(())
    }
}
