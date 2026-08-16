use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `commit_vrf_callback` (ADR-0009/0012). The
/// `vrf_program_identity` signer is constrained to the VRF program's identity
/// — ONLY the VRF program can call this. The subaccord is read-only here: the
/// callback copies its live `root_hash`/`total_stake` onto the dispute as the
/// frozen root.
#[derive(Accounts)]
pub struct CommitVrfCallback<'info> {
    #[account(address = ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity(&crate::ID))]
    pub vrf_program_identity: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.risk_type.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        mut,
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
}

impl<'info> CommitVrfCallback<'info> {
    pub fn handler_commit_vrf_callback(
        ctx: Context<CommitVrfCallback>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state != DisputeState::Failed,
            AccordError::DisputeFailed
        );
        require!(
            dispute.committed_vrf.is_none(),
            AccordError::VrfAlreadyCommitted
        );
        dispute.committed_vrf = Some(randomness);
        // ADR-0012: freeze the live accumulator root atomically with the VRF.
        dispute.frozen_root = ctx.accounts.subaccord.root_hash;
        dispute.frozen_total_stake = ctx.accounts.subaccord.total_stake;
        emit!(VrfCommitted {
            dispute: dispute.key(),
            vrf_result: randomness,
            frozen_root: dispute.frozen_root,
        });
        Ok(())
    }
}
