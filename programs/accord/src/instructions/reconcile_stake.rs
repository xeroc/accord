use crate::{constants::*, errors::AccordError, state::*, utils::*};
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

        let (new_root, new_total) = verify_and_recompute(
            &js.juror,
            old_amount,
            &js.juror,
            new_amount,
            js.tree_index,
            &path,
            &sub.root_hash,
            sub.total_stake,
        )?;

        js.staked = new_amount;
        js.stake_delta = 0;
        sub.root_hash = new_root;
        sub.total_stake = new_total;

        Ok(())
    }
}
