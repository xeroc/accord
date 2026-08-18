use crate::{constants::*, errors::AccordError, events::*, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `redraw` (ADR-0021) — the permissionless shortfall
/// crank. Same token-account shape as `CancelDispute` (the Fail branch refunds
/// the filer from the `fee_vault`); the Redraw branch leaves them untouched.
/// `remaining_accounts` carries the current round's `JurorStake` PDAs (always)
/// and, on exhaustion, prior appeal rounds + their bonds (same layout as
/// `cancel_dispute`).
#[derive(Accounts)]
pub struct Redraw<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
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
    /// The shortfall round (`dispute.current_round`).
    #[account(
        mut,
        seeds = [SEED_ROUND, dispute.key().as_ref(), &dispute.current_round.to_le_bytes()],
        bump,
    )]
    pub round: AccountLoader<'info, Round>,
    #[account(address = subaccord.fee_token)]
    pub fee_token: Account<'info, Mint>,
    /// Filer refund destination (Fail branch). Unused on the Redraw branch but
    /// always validated — the cranker passes it regardless.
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = dispute.filer,
    )]
    pub filer_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = fee_token,
        associated_token::authority = subaccord,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Redraw<'info> {
    pub fn handler_redraw(ctx: Context<Redraw>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state == DisputeState::RedrawEligible,
            AccordError::NotRedrawEligible
        );
        require_eq!(
            dispute.subaccord,
            ctx.accounts.subaccord.key(),
            AccordError::SubaccordMismatch
        );

        let dispute_key = dispute.key();
        let sub_key = ctx.accounts.subaccord.key();
        let terms = dispute.terms;
        let slash_per_juror = (terms.alpha_bps as u64)
            .checked_mul(terms.min_stake)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(AccordError::ArithmeticOverflow)?;

        let mut round = ctx.accounts.round.load_mut()?;
        let round_idx = round.round_idx;
        let panel = round.juror_count as usize;
        require!(panel > 0, AccordError::InvalidState);
        require!(
            ctx.remaining_accounts.len() >= panel,
            AccordError::InvalidPanelSize
        );

        let new_draw_attempt = round
            .draw_attempt
            .checked_add(1)
            .ok_or(AccordError::ArithmeticOverflow)?;
        let exhausted = new_draw_attempt >= terms.max_draw_attempts as u32;

        // --- Pass 1: slash no-shows; release active_draws + slash_reserve for
        //     every drawn juror of the failed round. ---
        // CU-opt field access — see `crate::layout`.
        const ACTIVE_DRAWS_OFFSET: usize = crate::layout::JS_ACTIVE_DRAWS_OFF;
        const STAKE_DELTA_OFFSET: usize = crate::layout::JS_STAKE_DELTA_OFF;
        const SLASH_RESERVE_OFFSET: usize = crate::layout::JS_SLASH_RESERVE_OFF;
        for i in 0..panel {
            let expected_pda = Pubkey::find_program_address(
                &[SEED_JUROR_STAKE, sub_key.as_ref(), round.jurors[i].as_ref()],
                &crate::ID,
            )
            .0;
            let acct_info = &ctx.remaining_accounts[i];
            require!(
                acct_info.key == &expected_pda,
                AccordError::InvalidMembershipProof
            );
            require!(
                acct_info.owner == &crate::ID,
                AccordError::InvalidMembershipProof
            );
            let no_show = round.reveals[i] == u64::MAX;
            let mut data = acct_info.try_borrow_mut_data()?;
            // active_draws -= 1: every drawn juror is released from this round.
            let draws = u32::from_le_bytes(
                data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                    .try_into()
                    .unwrap(),
            );
            data[ACTIVE_DRAWS_OFFSET..ACTIVE_DRAWS_OFFSET + 4]
                .copy_from_slice(&draws.saturating_sub(1).to_le_bytes());
            // Release this draw's slash reservation (reserved at `draw_seat`).
            let reserve = u64::from_le_bytes(
                data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                    .try_into()
                    .unwrap(),
            );
            data[SLASH_RESERVE_OFFSET..SLASH_RESERVE_OFFSET + 8]
                .copy_from_slice(&reserve.saturating_sub(slash_per_juror).to_le_bytes());
            // No-shows only: realize the slash into `stake_delta` (pending).
            if no_show {
                let delta = i64::from_le_bytes(
                    data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                        .try_into()
                        .unwrap(),
                );
                data[STAKE_DELTA_OFFSET..STAKE_DELTA_OFFSET + 8]
                    .copy_from_slice(&delta.saturating_sub(slash_per_juror as i64).to_le_bytes());
            }
        }

        if exhausted {
            // --- Fail branch: release prior appeal rounds + refund filer → Failed.
            let rounds_end = release_prior_rounds(
                ctx.remaining_accounts,
                &dispute_key,
                &sub_key,
                panel,
                round_idx,
                slash_per_juror,
            )?;
            // Strict accounting: prior rounds + this dispute's AppealBond PDAs
            // must fill the rest (same layout as `cancel_dispute`). Bonds are
            // NOT refunded here — they stay claimable via `claim_appeal_refund`.
            let appeal_n = round_idx as usize;
            require!(
                rounds_end + appeal_n == ctx.remaining_accounts.len(),
                AccordError::InvalidPanelSize
            );

            // ADR-0021: refund the filer's remaining fee pool (per-dispute
            // `fee_paid` — vault-safe for the shared Subaccord fee_vault; the
            // ADR-0020 invariant guarantees `fee_vault.balance ≥ fee_paid`).
            let refund = dispute.fee_paid;
            dispute.fee_paid = 0;
            let sub = &mut ctx.accounts.subaccord;
            let bump = [sub.bump];
            let signer_seeds = &[
                SEED_SUBACCORD,
                sub.creator.as_ref(),
                sub.domain_ref.as_ref(),
                &bump,
            ];
            if refund > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.fee_vault.to_account_info(),
                            to: ctx.accounts.filer_token_account.to_account_info(),
                            authority: sub.to_account_info(),
                        },
                        &[signer_seeds],
                    ),
                    refund,
                )?;
            }

            // Parallel vault ledger (bean accord-fdad): track the filer refund.
            if refund > 0 {
                sub.fee_vault_withdrawn = sub
                    .fee_vault_withdrawn
                    .checked_add(refund)
                    .ok_or(AccordError::ArithmeticOverflow)?;
            }

            round.draw_attempt = new_draw_attempt;
            dispute.state = DisputeState::Failed;

            emit!(DisputeFailedShortfall {
                dispute: dispute_key,
                filer: dispute.filer,
                draw_attempt: new_draw_attempt,
                refund,
            });
        } else {
            // --- Redraw branch: clear the round, re-open Created for fresh seats.
            require!(
                ctx.remaining_accounts.len() == panel,
                AccordError::InvalidPanelSize
            );
            round.draw_attempt = new_draw_attempt;
            round.juror_count = 0;
            round.commit_count = 0;
            round.reveal_count = 0;
            round.result = u64::MAX;
            round.review_end = 0;
            round.commit_end = 0;
            round.reveal_end = 0;
            round.jurors = [Pubkey::default(); MAX_JURORS];
            round.commits = [[0u8; 32]; MAX_JURORS];
            round.reveals = [u64::MAX; MAX_JURORS];
            round.seat_prefix = [0u64; MAX_JURORS];
            round.seat_stake = [0u64; MAX_JURORS];
            // now differs via the bumped `draw_attempt`.
            dispute.state = DisputeState::Created;

            emit!(Redrawn {
                dispute: dispute_key,
                round_idx,
                draw_attempt: new_draw_attempt,
            });
        }
        Ok(())
    }
}
