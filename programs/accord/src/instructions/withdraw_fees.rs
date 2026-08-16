use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `withdraw_fees` (ADR-0020). Per-juror pull of
/// aggregate `fees_earned` from the Subaccord's `fee_vault` → the juror's
/// `fee_token` ATA. No `active_draws` gate, no timelock.
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror.key().as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = juror,
    )]
    pub juror_fee_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawFees<'info> {
    pub fn handler_withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        let amt = js.fees_earned;
        require!(amt > 0, AccordError::NoFeesEarned);
        js.fees_earned = 0;

        let sub = &mut ctx.accounts.subaccord;
        sub.fee_vault_withdrawn = sub
            .fee_vault_withdrawn
            .checked_add(amt)
            .ok_or(AccordError::ArithmeticOverflow)?;

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
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.juror_fee_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            amt,
        )?;

        emit!(FeesWithdrawn {
            subaccord: sub.key(),
            juror: ctx.accounts.juror.key(),
            amount: amt,
        });
        Ok(())
    }
}
