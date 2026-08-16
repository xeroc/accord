use crate::events::*;
use anchor_lang::prelude::*;

/// Account context for `health` — the caller signs (liveness probe), no state.
#[derive(Accounts)]
pub struct Health<'info> {
    pub caller: Signer<'info>,
}

impl<'info> Health<'info> {
    pub fn handler_health(_ctx: Context<Health>) -> Result<()> {
        emit!(HealthChecked { version: 1 });
        Ok(())
    }
}
