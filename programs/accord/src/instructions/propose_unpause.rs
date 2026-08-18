use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ProposeUnpause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
}

impl<'info> ProposeUnpause<'info> {
    pub fn handler_propose_unpause(ctx: Context<ProposeUnpause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.accord_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(ctx.accounts.accord_state.paused, AccordError::NotPaused);
        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UNPAUSE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;
        ctx.accounts.accord_state.pending_unpause_after = Some(execute_after);
        emit!(UnpauseProposed {
            execute_after_slot: execute_after,
        });
        Ok(())
    }
}
