use crate::{constants::*, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializePause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + AccordState::INIT_SPACE,
        seeds = [SEED_ACCORD_STATE],
        bump,
    )]
    pub accord_state: Account<'info, AccordState>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializePause<'info> {
    pub fn handler_initialize_pause(ctx: Context<InitializePause>) -> Result<()> {
        ctx.accounts.accord_state.authority = ctx.accounts.authority.key();
        ctx.accounts.accord_state.paused = false;
        ctx.accounts.accord_state.pending_unpause_after = None;
        ctx.accounts.accord_state.bump = ctx.bumps.accord_state;
        Ok(())
    }
}
