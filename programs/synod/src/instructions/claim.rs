//! `claim` — SPEC §Instructions #5. Permissionless payout pull.
//!
//! Reads the bound Accord dispute's state — `Final` or `Failed` only (still
//! resolving -> `DisputeNotFinal`; ties redraw at Accord, Synod never
//! handles them). Pull-only + per-party: the caller passes the destination
//! party ATA (owner identifies the party), so a missing ATA for one party can
//! never block another. Idempotent via `paid_out` bits.
//!
//! Payout math (single mint, `fee_token`):
//! - `Final`, ruling `r < party_count` — prevailing party pulls the whole pot
//!   `N·S − fee`, one-shot; the case closes on that payout.
//! - `Final`, ruling `== party_count` (neutral) — each party pulls
//!   `⌊(N·S − fee)/N⌋`; the last claimant takes the remainder (vault drains
//!   exactly).
//! - `Failed` — Accord's `cancel_dispute` already returned the fee to the
//!   vault; each party pulls `S` in full.

use crate::constants::*;
use crate::error::SynodError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `claim`.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct Claim<'info> {
    /// Anyone (permissionless crank).
    pub caller: Signer<'info>,
    /// Case opener — seed component. Validated by the `case` seeds
    /// constraint.
    /// CHECK: the seeds constraint below re-derives the case PDA from it.
    pub opener: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_CASE, opener.key().as_ref(), &nonce.to_le_bytes()],
        bump = case.bump,
    )]
    pub case: Box<Account<'info, SynodCase>>,
    /// The bound Accord dispute (immutable after file — SPEC §Invariants 2).
    #[account(constraint = case.dispute == dispute.key() @ SynodError::DisputePdaMismatch)]
    pub dispute: Box<Account<'info, accord::state::Dispute>>,
    #[account(address = case.subaccord)]
    pub subaccord: Box<Account<'info, accord::state::Subaccord>>,
    #[account(address = subaccord.fee_token)]
    pub fee_mint: Box<Account<'info, Mint>>,
    /// Destination: the claiming party's `fee_token` token account (ATA by
    /// convention; any token account the party owns works). Mint + owner are
    /// verified in the handler — the authority is dynamic (any of the 7
    /// roster slots), which an `associated_token` constraint can't express.
    #[account(mut)]
    pub party_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = case,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Permissionless payout pull: one party's due share, per call.
pub fn handler(ctx: Context<Claim>, _nonce: u64) -> Result<()> {
    let case = &mut ctx.accounts.case;

    // The destination identifies the party (owner == parties[i]) — mint
    // checked against the single escrow mint first.
    require!(
        ctx.accounts.party_token_account.mint == ctx.accounts.subaccord.fee_token,
        SynodError::WrongMint
    );
    let owner = ctx.accounts.party_token_account.owner;
    let n = case.party_count;
    let i = case.parties[..n as usize]
        .iter()
        .position(|p| *p == owner)
        .ok_or(error!(SynodError::NotNamedParty))?;
    // Idempotent replay: already paid -> no-op, regardless of case state
    // (a closed case must not brick a paid party's re-pull).
    if case.paid_out & (1 << i) != 0 {
        return Ok(());
    }
    require!(case.state == CaseState::Live, SynodError::CaseNotLive);

    // claim reads only Final/Failed (HANDOFF §3); ties redraw at Accord.
    let dispute = &ctx.accounts.dispute;
    let amount = match dispute.state {
        accord::state::DisputeState::Final => {
            let r = dispute
                .ruling()
                .ok_or(error!(SynodError::DisputeNotFinal))?;
            require!(r <= n as u64, SynodError::InvalidRuling);
            if r < n as u64 {
                // Prevailing party takes the whole pot — one-shot.
                if i as u64 != r {
                    return Ok(()); // nothing due for a non-winner
                }
                (n as u64)
                    .checked_mul(case.stake)
                    .and_then(|pot| pot.checked_sub(case.fee))
                    .ok_or(error!(SynodError::ArithmeticOverflow))?
            } else {
                // Neutral: floor share; the LAST claimant drains whatever
                // remains (remainder + any accidental dust) — the vault
                // already had earlier shares deducted, so no re-subtraction.
                let pot = (n as u64)
                    .checked_mul(case.stake)
                    .and_then(|p| p.checked_sub(case.fee))
                    .ok_or(error!(SynodError::ArithmeticOverflow))?;
                let share = pot / n as u64;
                let after = case.paid_out | (1 << i);
                if after & case.joined == case.joined {
                    ctx.accounts.vault.amount
                } else {
                    share
                }
            }
        }
        accord::state::DisputeState::Failed => case.stake, // fee already returned
        _ => return err!(SynodError::DisputeNotFinal),
    };

    let signer_bump = case.bump;
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.party_token_account.to_account_info(),
                authority: ctx.accounts.case.to_account_info(),
            },
            &[&[
                SEED_CASE,
                ctx.accounts.opener.key().as_ref(),
                &_nonce.to_le_bytes(),
                &[signer_bump],
            ]],
        ),
        amount,
    )?;

    let case = &mut ctx.accounts.case;
    case.paid_out |= 1 << i;
    // Close when nothing remains due: winner payout is one-shot; neutral /
    // failed need every joined bit.
    let winner_one_shot = matches!(dispute.state, accord::state::DisputeState::Final)
        && dispute.ruling().is_some_and(|r| r < n as u64);
    if winner_one_shot || case.paid_out & case.joined == case.joined {
        case.state = CaseState::Closed;
    }
    Ok(())
}
