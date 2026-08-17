use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `reveal`. Same shape as `Commit` — ADR-0020 removed the
/// participation-fee SPL transfer (fees are credited at `finalize_round`
/// instead). No token accounts needed.
#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(
        seeds = [SEED_SUBACCORD, subaccord.creator.as_ref(), subaccord.domain_ref.as_ref()],
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

impl<'info> Reveal<'info> {
    pub fn handler_reveal(ctx: Context<Reveal>, vote: u8, salt: [u8; 32]) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Commit || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        require!(vote < dispute.num_options, AccordError::InvalidVote);
        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        // Reveal opens at `commit_end`, OR as soon as the panel is fully
        // committed (early reveal — see `commit`). Only the lower bound is
        // relaxed; the `reveal_end` upper bound is unchanged.
        let all_committed = round.commit_count == round.juror_count;
        require!(
            now >= round.commit_end || all_committed,
            AccordError::RevealWindowClosed
        );
        require!(now < round.reveal_end, AccordError::RevealWindowClosed);

        let juror_key = ctx.accounts.juror.key();
        let idx = round.jurors[..round.juror_count as usize]
            .iter()
            .position(|j| *j == juror_key)
            .ok_or(AccordError::NotDrawnJuror)?;

        let committed = round.commits[idx];
        require!(committed != [0u8; 32], AccordError::CommitMissing);
        require!(round.reveals[idx] == u8::MAX, AccordError::AlreadyRevealed);

        use solana_program::hash::hashv;
        let computed = hashv(&[&[vote], &salt, juror_key.as_ref()]).to_bytes();
        require!(computed == committed, AccordError::RevealMismatch);

        round.reveals[idx] = vote;
        round.reveal_count = round
            .reveal_count
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;

        if dispute.state == DisputeState::Commit {
            dispute.state = DisputeState::Reveal;
        }

        emit!(Revealed {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            juror: juror_key,
            vote,
        });
        Ok(())
    }
}
