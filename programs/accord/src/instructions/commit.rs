use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

// --- Voting & Ruling account contexts (veridao-pq1s) --------------------------

/// Account context for `commit`. The juror signs; the round is zero-copy
/// (`AccountLoader`), re-derived from the dispute + current round.
#[derive(Accounts)]
pub struct Commit<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
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
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

impl<'info> Commit<'info> {
    pub fn handler_commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn || dispute.state == DisputeState::Commit,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= round.review_end, AccordError::CommitWindowClosed);
        require!(now < round.commit_end, AccordError::CommitWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        require!(
            round.commits[idx] == [0u8; 32],
            AccordError::CommitAlreadyExists
        );
        round.commits[idx] = commitment;
        round.commit_count = round
            .commit_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Drawn {
            dispute.state = DisputeState::Commit;
        }
        // Once every drawn juror has committed, all votes are cryptographically
        // bound and immutable — the hiding property has done its work, so flip
        // to `Reveal` immediately rather than idling out the commit window.
        if round.commit_count == round.juror_count {
            dispute.state = DisputeState::Reveal;
        }

        emit!(Committed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
        });
        Ok(())
    }
}
