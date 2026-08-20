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
        // SR2-L-5 (security review 2026-08-19, shared-base §31.7): arm once —
        // repeated proposals must not keep pushing the executable slot
        // forward. `pending_unpause_after` never expires (execute_unpause has
        // no deadline), so re-arming is never needed; if the armed slot is
        // wrong the authority pauses again, which clears the pending unpause.
        if ctx.accounts.accord_state.pending_unpause_after.is_none() {
            let slot = Clock::get()?.slot;
            let execute_after = slot
                .checked_add(UNPAUSE_TIMELOCK_SLOTS)
                .ok_or(AccordError::ArithmeticOverflow)?;
            ctx.accounts.accord_state.pending_unpause_after = Some(execute_after);
            emit!(UnpauseProposed {
                execute_after_slot: execute_after,
            });
        }
        Ok(())
    }
}
