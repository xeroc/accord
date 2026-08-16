use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `withdraw` (REVIEW #5). Transfers locked tokens from
/// the vault to the juror's ATA (PDA-signed). No root update — root was
/// updated at `request_withdraw` time.
#[derive(Accounts)]
pub struct Withdraw<'info> {
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
    #[account(address = subaccord.staking_token)]
    pub staking_token: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = juror,
    )]
    pub juror_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = staking_token,
        associated_token::authority = subaccord,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Withdraw<'info> {
    pub fn handler_withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        require!(js.pending_withdrawal > 0, AccordError::NoPendingWithdrawal);

        let now = Clock::get()?.unix_timestamp;
        let deadline = js
            .withdraw_requested_at
            .checked_add(WITHDRAWAL_DELAY)
            .ok_or(AccordError::ArithmeticOverflow)?;
        require!(now >= deadline, AccordError::WithdrawalTooEarly);
        require!(js.active_draws == 0, AccordError::StakeLocked);

        let amount = js.pending_withdrawal;
        js.pending_withdrawal = 0;
        js.withdraw_requested_at = 0;

        let sub = &mut ctx.accounts.subaccord;
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
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.juror_token_account.to_account_info(),
                    authority: sub.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
        )?;

        // Parallel vault ledger (bean accord-fdad): track the SPL withdrawal.
        sub.stake_vault_withdrawn = sub
            .stake_vault_withdrawn
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: ctx.accounts.juror.key(),
            amount,
        });
        Ok(())
    }
}
