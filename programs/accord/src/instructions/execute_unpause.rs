use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ExecuteUnpause<'info> {
    /// Any cranker pays the tx fee; no authority check on execute (ADR-0007:
    /// the notice period, not the signer, gates the unpause).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
}

impl<'info> ExecuteUnpause<'info> {
    pub fn handler_execute_unpause(ctx: Context<ExecuteUnpause>) -> Result<()> {
        let execute_after = ctx
            .accounts
            .accord_state
            .pending_unpause_after
            .ok_or(AccordError::NoPendingUnpause)?;
        let slot = Clock::get()?.slot;
        require!(
            slot >= execute_after,
            AccordError::UnpauseTimelockNotElapsed
        );
        let authority = ctx.accounts.accord_state.authority;
        ctx.accounts.accord_state.paused = false;
        ctx.accounts.accord_state.pending_unpause_after = None;
        emit!(Unpaused { authority });
        Ok(())
    }
}
