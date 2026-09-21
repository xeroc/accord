use crate::{constants::*, errors::AccordError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `finalize_round` — permissionless crank.
#[derive(Accounts)]
pub struct FinalizeRound<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
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

        // --- Quorum met: tally (ADR-0019 aggregation) + resolve (ADR-0029: fees settle at finality) ---
        let winner = match dispute.terms.aggregation {
            Aggregation::Plurality => {
                let mut counts = [0u32; MAX_OPTIONS];
                for i in 0..round.juror_count as usize {
                    let v = round.reveals[i];
                    if v != u64::MAX && (v as usize) < MAX_OPTIONS {
                        counts[v as usize] += 1;
                    }
                }
                let live = &counts[..dispute.num_options as usize];
                // ADR-0026: a top-count tie (≥2 options sharing the max) is a
                // NON-DECISIVE round — identical in kind to the ADR-0021
                // reveal-quorum shortfall. No credits, no result; `redraw`
                // reconvenes the panel (or the dispute fails on
                // `max_draw_attempts` exhaustion). Odd panels only prevent
                // ties for binary full-reveal rounds — ≥3 options (2-2-1)
                // and non-reveals (2-2 of 5) still deadlock, and the old
                // `.max_by_key` crowned the highest tied index arbitrarily.
                // This also covers the degenerate zero-reveal round (all
                // options tied at 0): redraw instead of a fabricated winner.
                let max = *live.iter().max().unwrap_or(&0);
                if live.iter().filter(|&&c| c == max).count() > 1 {
                    dispute.state = DisputeState::RedrawEligible;
                    return Ok(());
                }
                live.iter().position(|&c| c == max).unwrap_or(0) as u64
            }
            // Scalar tally (ADR-0025): median of the revealed values. Panels
            // are odd by construction (`(J+1)·2^k − 1`), but non-revealers can
            // leave an even reveal count — then `vs[n/2]` picks the UPPER
            // middle element (n=4 → index 2; deterministic, biased high).
            // `n == 0` is impossible on a compliant pool: Median subaccords
            // are created with `reveal_threshold_bps > 0` (SR2-M-1), so
            // `needed ≥ 1` and the quorum gate above rejects a zero-reveal
            // round into RedrawEligible before this tally runs.
            Aggregation::Median => {
                let mut vs = [0u64; MAX_JURORS];
                let mut n = 0usize;
                for i in 0..round.juror_count as usize {
                    if round.reveals[i] != u64::MAX {
                        vs[n] = round.reveals[i];
                        n += 1;
                    }
                }
                vs[..n].sort_unstable();
                vs[n / 2]
            }
        };
        round.result = winner;
        // ADR-0029: no fee credit here. The round's ENTIRE fee pot settles at
        // `settle_round` / `finalize_dispute` against `final_ruling` —
        // coherent jurors split the whole pot, incoherent revealers forfeit
        // their base fee into it. `dispute.fee_paid` is likewise untouched
        // until settlement consumes the round-0 pot, so filer refunds on
        // cancel/redraw-exhaustion are trivially exact. This instruction no
        // longer needs the panel's JurorStake PDAs in remaining_accounts.

        dispute.state = DisputeState::RoundResolved;

        emit!(RoundResolved {
            dispute: dispute.key(),
            round_idx: round.round_idx,
            result: winner,
        });
        Ok(())
    }
}
