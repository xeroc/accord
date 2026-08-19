use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `execute_subaccord_update` (veridao-y63e).
///
/// Permissionless: any caller may land the update once the timelock elapses.
/// The `PendingUpdate` is re-derived from the Subaccord + its stored nonce +
/// canonical bump, and closed on success (rent refunded to the caller).
#[derive(Accounts)]
pub struct ExecuteSubaccordUpdate<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Account<'info, Subaccord>,
    #[account(
        mut,
        seeds = [SEED_PENDING_UPDATE, subaccord.key().as_ref(), &pending_update.nonce.to_le_bytes()],
        bump = pending_update.bump,
        close = caller,
    )]
    pub pending_update: Account<'info, PendingUpdate>,
}

impl<'info> ExecuteSubaccordUpdate<'info> {
    pub fn handler_execute_subaccord_update(ctx: Context<ExecuteSubaccordUpdate>) -> Result<()> {
        let nonce = ctx.accounts.pending_update.nonce;
        let execute_after = ctx.accounts.pending_update.execute_after_slot;
        let slot = Clock::get()?.slot;
        require!(slot >= execute_after, AccordError::TimelockNotElapsed);
        // H-1: defense-in-depth — re-validate at execute even though propose
        // already checked (§29.3: validate in every write path).
        validate_update_payload(&ctx.accounts.pending_update.proposed)?;
        // SR2-L-1: re-validate the cross-field bound against the live pool.
        validate_update_cross_field(
            &ctx.accounts.subaccord,
            &ctx.accounts.pending_update.proposed,
        )?;

        let sub = &mut ctx.accounts.subaccord;
        match &ctx.accounts.pending_update.proposed {
            UpdatePayload::MinStake(v) => sub.min_stake = *v,
            UpdatePayload::AlphaBps(v) => sub.alpha_bps = *v,
            UpdatePayload::ReviewWindow(v) => sub.review_window = *v,
            UpdatePayload::CommitWindow(v) => sub.commit_window = *v,
            UpdatePayload::RevealWindow(v) => sub.reveal_window = *v,
            UpdatePayload::AppealWindow(v) => sub.appeal_window = *v,
            UpdatePayload::MaxAppeals(v) => sub.max_appeals = *v,
            UpdatePayload::FeePerJuror(v) => sub.fee_per_juror = *v,
            UpdatePayload::Authority(v) => sub.authority = *v,
            UpdatePayload::EvidenceOperator(v) => sub.evidence_operator = *v,
        }

        emit!(UpdateExecuted {
            subaccord: ctx.accounts.subaccord.key(),
            nonce,
        });
        Ok(())
    }
}
