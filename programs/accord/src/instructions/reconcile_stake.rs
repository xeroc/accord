use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `reconcile_stake` (REVIEW #4). Permissionless — any
/// caller may trigger. No token accounts needed (pure ledger + root update).
#[derive(Accounts)]
pub struct ReconcileStake<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_JUROR_STAKE, subaccord.key().as_ref(), juror_stake.juror.as_ref()],
        bump = juror_stake.bump,
    )]
    pub juror_stake: Account<'info, JurorStake>,
}

impl<'info> ReconcileStake<'info> {
    pub fn handler_reconcile_stake(ctx: Context<ReconcileStake>, path: Vec<MSTNode>) -> Result<()> {
        let js = &mut ctx.accounts.juror_stake;
        let sub = &mut ctx.accounts.subaccord;

        require!(js.stake_delta != 0, AccordError::InvalidAmount);

        let old_amount = js.staked;
        let new_amount = (js.staked as i64).saturating_add(js.stake_delta).max(0) as u64;

        // Clean ejection (2026-09-28): a fold that lands strictly between 0
        // and min_stake is an ejected juror — an incoherent vote took them
        // below the floor. The leaf is written at ZERO weight (a sub-min
        // leaf would be sortition dust — positive weight, undrawable, the
        // SR3-H-1 dead zone), the remainder is banked into
        // `pending_withdrawal` on the existing two-phase rail (delay +
        // active_draws == 0), and `staker_count` decrements exactly as
        // `request_withdraw` does on a full exit. A fold to exactly 0
        // (α = 100%) or to ≥ min_stake keeps the plain fold.
        let ejected = new_amount > 0 && new_amount < sub.min_stake;
        let leaf_amount = if ejected { 0 } else { new_amount };

        let (new_root, new_total) = verify_and_recompute(
            &js.juror,
            old_amount,
            &js.juror,
            leaf_amount,
            js.tree_index,
            sub.depth,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = leaf_amount;
        js.stake_delta = 0;
        sub.root_hash = new_root;
        sub.total_stake = new_total;

        if ejected {
            js.pending_withdrawal = js
                .pending_withdrawal
                .checked_add(new_amount)
                .ok_or(AccordError::ArithmeticOverflow)?;
            js.withdraw_requested_at = Clock::get()?.unix_timestamp;
            if old_amount > 0 {
                sub.staker_count = sub.staker_count.saturating_sub(1);
            }
            emit!(Unstaked {
                subaccord: sub.key(),
                juror: js.juror,
                amount: new_amount,
            });
        }

        Ok(())
    }
}
