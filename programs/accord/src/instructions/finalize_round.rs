use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `finalize_round` — permissionless crank.
#[derive(Accounts)]
pub struct FinalizeRound<'info> {
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
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
}

impl<'info> FinalizeRound<'info> {
    pub fn handler_finalize_round(ctx: Context<FinalizeRound>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::Drawn
                || dispute.state == DisputeState::Commit
                || dispute.state == DisputeState::Reveal,
            AccordError::InvalidState
        );

        let round = &mut ctx.accounts.round.load_mut()?;
        let now = Clock::get()?.unix_timestamp;
        // Finalize at `reveal_end`, OR once the panel has fully revealed (early
        // resolve). The `juror_count > 0` guard avoids the degenerate 0==0
        // empty-panel match; a voting-state round always has a full panel.
        let all_revealed = round.juror_count > 0 && round.reveal_count == round.juror_count;
        require!(
            now >= round.reveal_end || all_revealed,
            AccordError::RoundNotFinalizable
        );

        let panel = round.juror_count;

        // --- ADR-0021: reveal-quorum threshold gate ---
        // ceil(panel × threshold_bps / 10_000). `panel` is the frozen round-1
        // or appeal panel; the absolute commitment escalates per appeal for
        // free via panel growth (the fraction is fixed).
        let needed = (panel as u64)
            .checked_mul(dispute.terms.reveal_threshold_bps as u64)
            .and_then(|v| v.checked_add(9_999))
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;
        if (round.reveal_count as u64) < needed {
            // Shortfall: no credits, no result. Hand the round to `redraw`.
            dispute.state = DisputeState::RedrawEligible;
            return Ok(());
        }

        // --- Quorum met: tally (ADR-0019 aggregation) + credit + resolve ---
        let winner = match dispute.terms.aggregation {
            Aggregation::Plurality => {
                let mut counts = [0u32; MAX_OPTIONS];
                for i in 0..round.juror_count as usize {
                    let v = round.reveals[i];
                    if v != u8::MAX && (v as usize) < MAX_OPTIONS {
                        counts[v as usize] += 1;
                    }
                }
                (0..dispute.num_options as usize)
                    .max_by_key(|&i| counts[i])
                    .unwrap_or(0) as u8
            }
        };
        round.result = winner;

        // --- ADR-0020: credit fees_earned to each revealer ---
        let sub_key = ctx.accounts.subaccord.key();
        let fee_per_juror = dispute.terms.fee_per_juror;
        let panel_us = round.juror_count as usize;
        if fee_per_juror > 0 {
            require!(
                ctx.remaining_accounts.len() == panel_us,
                AccordError::InvalidPanelSize
            );
            // CU-opt field access — see `crate::layout`.
            const FEES_EARNED_OFFSET: usize = crate::layout::JS_FEES_EARNED_OFF;
            for i in 0..panel_us {
                if round.reveals[i] == u8::MAX {
                    continue; // non-revealer: no credit
                }
                let expected_pda = Pubkey::find_program_address(
                    &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
                    &crate::ID,
                )
                .0;
                let js_info = &ctx.remaining_accounts[i];
                require!(
                    js_info.key == &expected_pda,
                    AccordError::InvalidMembershipProof
                );
                require!(
                    js_info.owner == &crate::ID,
                    AccordError::InvalidMembershipProof
                );
                let mut data = js_info.try_borrow_mut_data()?;
                let existing = u64::from_le_bytes(
                    data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                let new_fees = existing
                    .checked_add(fee_per_juror)
                    .ok_or(AccordError::ArithmeticOverflow)?;
                data[FEES_EARNED_OFFSET..FEES_EARNED_OFFSET + 8]
                    .copy_from_slice(&new_fees.to_le_bytes());
            }
            // fee_paid owns ONLY the round-0 filing fee (bean accord-xftx):
            // appeal-round fees live in their AppealBond, not here. Decrement
            // the filer's refundable pool only as round-0 jurors earn. The
            // fees_earned credit above still runs for every round — that is the
            // vault liability (juror compensation), tracked separately from this
            // filer-refund bookkeeping.
            if round.round_idx == 0 {
                dispute.fee_paid = (round.reveal_count as u64)
                    .checked_mul(fee_per_juror)
                    .and_then(|earned| dispute.fee_paid.checked_sub(earned))
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }
        }

        dispute.state = DisputeState::RoundResolved;

        emit!(RoundResolved {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            result: winner,
        });
        Ok(())
    }
}
