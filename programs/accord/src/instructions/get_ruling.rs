use crate::{constants::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `get_ruling` — read-only CPI entry for Arbitrables.
#[derive(Accounts)]
pub struct GetRuling<'info> {
    /// Fee payer for the transaction (CPI caller or cranker).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
}

impl<'info> GetRuling<'info> {
    pub fn handler_get_ruling(ctx: Context<GetRuling>) -> Result<Option<u8>> {
        Ok(ctx.accounts.dispute.ruling())
    }
}
