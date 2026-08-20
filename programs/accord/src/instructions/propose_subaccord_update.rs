use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `propose_subaccord_update` (veridao-y63e).
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ProposeSubaccordUpdate<'info> {
    /// Must equal `subaccord.authority`; signs + pays for the PendingUpdate.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        init,
        payer = authority,
        space = 8 + PendingUpdate::INIT_SPACE,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
    pub system_program: Program<'info, System>,
}

impl<'info> ProposeSubaccordUpdate<'info> {
    pub fn handler_propose_subaccord_update(
        ctx: Context<ProposeSubaccordUpdate>,
        nonce: u64,
        payload: UpdatePayload,
    ) -> Result<()> {
        let sub = &ctx.accounts.subaccord;
        require!(
            sub.authority != Pubkey::default(),
            AccordError::ImmutableSubaccord
        );
        require!(
            ctx.accounts.authority.key() == sub.authority,
            AccordError::Unauthorized
        );
        // H-1: reject invalid updates at propose time so the authority gets
        // immediate feedback instead of wasting the 48h timelock period.
        validate_update_payload(&payload)?;
        // SR2-L-1: cross-field bounds that need the live pool (appeal ladder).
        validate_update_cross_field(&ctx.accounts.subaccord, &payload)?;

        let slot = Clock::get()?.slot;
        let execute_after = slot
            .checked_add(UPDATE_TIMELOCK_SLOTS)
            .ok_or(AccordError::ArithmeticOverflow)?;

        let pu = &mut ctx.accounts.pending_update;
        pu.subaccord = ctx.accounts.subaccord.key();
        pu.nonce = nonce;
        pu.proposed = payload.clone();
        pu.proposed_by = ctx.accounts.authority.key();
        pu.execute_after_slot = execute_after;
        pu.bump = ctx.bumps.pending_update;

        emit!(UpdateProposed {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
            payload,
            execute_after_slot: execute_after,
        });
        Ok(())
    }
}
