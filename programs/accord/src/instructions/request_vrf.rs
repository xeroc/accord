use crate::instruction;
use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::vrf;
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_high_priority_scoped_randomness_ix, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

/// Account context for `request_vrf` (ADR-0009/0012). Uses `#[vrf]` to gain
/// `invoke_signed_vrf` for the CPI into the VRF program. The subaccord is
/// forwarded to the callback so it can copy the live accumulator root.
#[vrf]
#[derive(Accounts)]
pub struct RequestVrf<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
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
    /// CHECK: VRF oracle queue (mainnet default).
    #[account(mut, address = ephemeral_rollups_sdk::vrf::consts::DEFAULT_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

impl<'info> RequestVrf<'info> {
    #[allow(unused_variables)]
    pub fn handler_request_vrf(ctx: Context<RequestVrf>) -> Result<()> {
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state != DisputeState::Failed,
            AccordError::DisputeFailed
        );
        require!(
            dispute.state == DisputeState::Created,
            AccordError::InvalidState
        );
        require!(
            dispute.committed_vrf.is_none(),
            AccordError::VrfAlreadyCommitted
        );

        let dispute_key = dispute.key();
        let subaccord_key = ctx.accounts.subaccord.key();
        // Forward both the dispute (writable — callback writes VRF + frozen
        // root) and the subaccord (read-only — callback copies its live root).
        let ix = create_request_high_priority_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.caller.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::CommitVrfCallback::DISCRIMINATOR.to_vec(),
            caller_seed: dispute_key.to_bytes(),
            // ORDER IS LOAD-BEARING: the VRF oracle prepends the scoped
            // vrf_program_identity, then appends these metas positionally onto
            // the CommitVrfCallback struct fields. So this list MUST mirror the
            // callback struct field order AFTER the identity: [subaccord,
            // dispute]. A swap lands `dispute` on the `subaccord` field and
            // fails the callback with AccountDiscriminatorMismatch — which the
            // oracle observes via pre-simulation and never submits (the request
            // then stalls at its queue index indefinitely).
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: subaccord_key,
                    is_signer: false,
                    is_writable: false,
                },
                SerializableAccountMeta {
                    pubkey: dispute_key,
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.caller.to_account_info(), &ix)?;

        emit!(VrfRequested {
            dispute: dispute_key,
        });
        Ok(())
    }
}
