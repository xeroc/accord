use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;

/// Account context for `settle_round` — permissionless crank that settles a
/// prior round's coherence economics against the finalized ruling (Ugly 5).
/// The round PDA is keyed by the instruction arg `round_idx` (not
/// `current_round`). Drawn `JurorStake` accounts are `remaining_accounts`.
#[derive(Accounts)]
#[instruction(round_idx: u32)]
pub struct SettleRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
        bump = subaccord.bump,
    )]
    pub subaccord: Box<Account<'info, Subaccord>>,
    #[account(
        seeds = [SEED_DISPUTE, dispute.filer.as_ref(), &dispute.nonce.to_le_bytes()],
        bump = dispute.bump,
        has_one = subaccord,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &round_idx.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

impl<'info> SettleRound<'info> {
    pub fn handler_settle_round(ctx: Context<SettleRound>, round_idx: u32) -> Result<()> {
        let dispute = &ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Final,
            AccordError::DisputeNotFinal
        );
        require!(
            round_idx < dispute.current_round,
            AccordError::RoundNotSettlable
        );
        let final_ruling = dispute.final_ruling;
        require!(final_ruling != u8::MAX, AccordError::InvalidState);

        let mut round = ctx.accounts.round.load_mut()?;
        require!(round.round_idx == round_idx, AccordError::InvalidState);
        require!(round.settled == 0, AccordError::RoundAlreadySettled);

        let sub_key = ctx.accounts.subaccord.key();
        let panel = round.juror_count as usize;
        require!(
            ctx.remaining_accounts.len() == panel,
            AccordError::InvalidPanelSize
        );

        settle_round_accounts(
            &round,
            &dispute.terms,
            &sub_key,
            ctx.remaining_accounts,
            final_ruling,
            0, // no appeal bonds in prior-round settlement
        )?;

        round.settled = 1;

        emit!(RoundSettled {
            dispute: dispute.key(),
            round_idx,
        });
        Ok(())
    }
}
