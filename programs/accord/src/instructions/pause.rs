use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_ACCORD_STATE], bump = accord_state.bump)]
    pub accord_state: Account<'info, AccordState>,
}

impl<'info> Pause<'info> {
    pub fn handler_pause(ctx: Context<Pause>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.accord_state.authority,
            AccordError::NotPauseAuthority
        );
        require!(
            !ctx.accounts.accord_state.paused,
            AccordError::AlreadyPaused
        );
        ctx.accounts.accord_state.paused = true;
        // a fresh pause cancels any pending unpause
        ctx.accounts.accord_state.pending_unpause_after = None;
        emit!(Paused {
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }
}
