use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `unstake` (veridao-b2sc).
///
/// Mirror of `Stake` minus the pause account (unstake is never halted —
/// ADR-0007 traps no capital) and minus `init_if_needed`/`associated_token_program`
/// (both accounts already exist: the vault was created on first stake, the
/// `JurorStake` on first stake). The vault is the **Subaccord PDA's** ATA so the
/// program PDA-signs the transfer out.
/// Account context for `request_withdraw` (REVIEW #5). Ledger-only — updates
/// the accumulator root and JurorStake. No token transfer.
#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
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
}

impl<'info> RequestWithdraw<'info> {
    pub fn handler_request_withdraw(
        ctx: Context<RequestWithdraw>,
        amount: u64,
        path: Vec<MSTNode>,
    ) -> Result<()> {
        require!(amount > 0, AccordError::InvalidAmount);
        // M-1: reject repeated calls while a withdrawal is pending — forces the
        // juror to complete the two-phase flow (withdraw) before requesting again.
        require!(
            ctx.accounts.juror_stake.pending_withdrawal == 0,
            AccordError::WithdrawalPending
        );

        let juror_key = ctx.accounts.juror.key();
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        // DRY with reconcile_stake: the ledger must be canonical (no pending
        // reward/slash) before we touch `staked`. `reconcile_stake` folds the
        // delta first; withdraw only ever reads the canonical `staked`.
        require!(js.stake_delta == 0, AccordError::PendingSettlement);

        // Cannot withdraw more than the free stake: raw amount minus the slash
        // reserve held against in-flight draws.
        let free_stake = js.staked.saturating_sub(js.slash_reserve);
        require!(amount <= free_stake, AccordError::InsufficientBalance);

        let old_stake = js.staked;
        let new_stake = old_stake
            .checked_sub(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let index = js.tree_index;

        let (new_root, new_total) = verify_and_recompute(
            &juror_key,
            old_stake,
            &juror_key,
            new_stake,
            index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = new_stake;
        js.pending_withdrawal = js
            .pending_withdrawal
            .checked_add(amount)
            .ok_or(AccordError::ArithmeticOverflow)?;
        js.withdraw_requested_at = Clock::get()?.unix_timestamp;

        if new_stake == 0 && old_stake > 0 {
            sub.staker_count = sub.staker_count.saturating_sub(1);
        }

        sub.root_hash = new_root;
        sub.total_stake = new_total;

        emit!(Unstaked {
            subaccord: sub.key(),
            juror: juror_key,
            amount,
        });
        Ok(())
    }
}
