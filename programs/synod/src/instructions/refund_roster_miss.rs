//! `refund_roster_miss` — SPEC §Instructions #4. Permissionless refund crank.
//!
//! After `join_deadline` passes with an incomplete roster, each JOINED party
//! pulls its stake `S` back out of the vault. Pull-only + per-party: the
//! caller passes the destination party ATA (which identifies the party), so a
//! missing ATA for one party can never block another. Idempotent via
//! `paid_out` bits; the case closes when every joined bit is paid. No fee was
//! ever paid (the dispute was never filed).

use crate::constants::*;
use crate::errors::SynodError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `refund_roster_miss`.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct RefundRosterMiss<'info> {
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
    #[account(address = case.subaccord)]
    pub subaccord: Box<Account<'info, accord::state::Subaccord>>,
    #[account(address = subaccord.fee_token)]
    pub fee_mint: Box<Account<'info, Mint>>,
    /// Destination: the joined party's `fee_token` token account (ATA by
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

/// Permissionless refund crank: one joined party's `S` back, per call.
pub fn handler(ctx: Context<RefundRosterMiss>, _nonce: u64) -> Result<()> {
    let case = &mut ctx.accounts.case;
    let n = case.party_count;

    // The destination identifies the party (owner == parties[i]) — mint
    // checked against the single escrow mint first.
    require!(
        ctx.accounts.party_token_account.mint == ctx.accounts.subaccord.fee_token,
        SynodError::WrongMint
    );
    let owner = ctx.accounts.party_token_account.owner;
    let i = case.parties[..n as usize]
        .iter()
        .position(|p| *p == owner)
        .ok_or(error!(SynodError::NotNamedParty))?;
    require!(case.joined & (1 << i) != 0, SynodError::PartyNotJoined);
    // Idempotent replay: already paid -> no-op, regardless of case state.
    if case.paid_out & (1 << i) != 0 {
        return Ok(());
    }

    // State + deadline + roster gates (check-and-set: state leaves Opening
    // only via this path or file_dispute, so double-refund/double-file are
    // structurally impossible).
    require!(case.state == CaseState::Opening, SynodError::NotOpening);
    require!(
        Clock::get()?.unix_timestamp >= case.join_deadline,
        SynodError::JoinDeadlineNotReached
    );
    require!(
        case.joined != (1u16 << n) as u8 - 1,
        SynodError::RosterComplete
    );

    let stake = case.stake;
    let signer_bump = case.bump;
    // S back: vault -> party ATA, case PDA signs.
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
        stake,
    )?;

    let case = &mut ctx.accounts.case;
    case.paid_out |= 1 << i;
    if case.paid_out & case.joined == case.joined {
        case.state = CaseState::Closed;
    }
    Ok(())
}
