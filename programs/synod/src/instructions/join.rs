//! `join` — SPEC §Instructions #2. Named-party stake + evidence commitment.
//!
//! `signer == parties[i]` for an unjoined `i`, before `join_deadline`, while
//! the case is `Opening`. Transfers the per-party stake `S` (in
//! `subaccord.fee_token`) from the party ATA into the case-PDA vault ATA
//! (lazily created on first join — canon precedent) and freezes the party's
//! evidence hash into its slot (late evidence rides appeal rounds, ADR-0023,
//! via independent appeal).

use crate::errors::SynodError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `join`.
#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub party: Signer<'info>,
    #[account(
        mut,
        constraint = case.state == CaseState::Opening @ SynodError::NotOpening
    )]
    pub case: Box<Account<'info, SynodCase>>,
    /// Hosting court, linked to the case. Read for `fee_token` — the single
    /// mint for stake + fee (ADR-0020).
    #[account(address = case.subaccord)]
    pub subaccord: Box<Account<'info, accord::state::Subaccord>>,
    #[account(address = subaccord.fee_token)]
    pub fee_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = party,
    )]
    pub party_token_account: Box<Account<'info, TokenAccount>>,
    /// Case-PDA-owned vault for `fee_mint` stakes. Lazily created on first
    /// join.
    #[account(
        init_if_needed,
        payer = party,
        associated_token::mint = fee_mint,
        associated_token::authority = case,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Named-party join: locks `S`, freezes the evidence hash slot.
pub fn handler(ctx: Context<Join>, evidence_hash: [u8; 32]) -> Result<()> {
    let case = &mut ctx.accounts.case;

    // Signer must be a named party.
    let i = case.parties[..case.party_count as usize]
        .iter()
        .position(|p| *p == ctx.accounts.party.key())
        .ok_or(error!(SynodError::NotNamedParty))?;
    require!(case.joined & (1 << i) == 0, SynodError::AlreadyJoined);
    require!(
        Clock::get()?.unix_timestamp < case.join_deadline,
        SynodError::JoinDeadlinePassed
    );

    // Stake: party ATA -> case vault. Fee-on-transfer safe (canon precedent):
    // credit only what actually landed.
    let stake = case.stake;
    let before = ctx.accounts.vault.amount;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.party_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.party.to_account_info(),
            },
        ),
        stake,
    )?;
    ctx.accounts.vault.reload()?;
    let delta = ctx
        .accounts
        .vault
        .amount
        .checked_sub(before)
        .ok_or(error!(SynodError::ArithmeticOverflow))?;
    require!(delta == stake, SynodError::StakeTransferShortfall);

    case.evidence[i] = evidence_hash;
    case.joined |= 1 << i;

    Ok(())
}
