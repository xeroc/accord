//! `open_case` — SPEC §Instructions #1. Permissionless case opening.
//!
//! Runs every SPEC §Open-time validation, freezes `fee =
//! min_jury_size · fee_per_joror` from the Subaccord onto the case (never
//! re-read — governance can't shift the deal mid-window), and inits the
//! `SynodCase` PDA `["case", opener, nonce]` in `Opening`. The opener does NOT
//! stake here — it joins via `join` like everyone else.

use crate::constants::*;
use crate::error::SynodError;
use crate::state::*;
use accord::state::Aggregation;
use anchor_lang::prelude::*;

/// Account context for `open_case`.
#[derive(Accounts)]
// `nonce` is the 4th handler arg; anchor requires listing all preceding args
// positionally (no `_` skip in this anchor version — same note as canon).
#[instruction(parties: Vec<Pubkey>, stake: u64, join_deadline: i64, nonce: u64)]
pub struct OpenCase<'info> {
    #[account(mut)]
    pub opener: Signer<'info>,
    /// The hosting Accord court. Read ONCE here for `aggregation`,
    /// `min_jury_size`, `fee_per_juror`; the derived fee is frozen onto the
    /// case. Chosen freely by the opener (no seed link).
    pub subaccord: Account<'info, accord::state::Subaccord>,
    #[account(
        init,
        payer = opener,
        space = 8 + SynodCase::INIT_SPACE,
        seeds = [SEED_CASE, opener.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub case: Account<'info, SynodCase>,
    pub system_program: Program<'info, System>,
}

/// Permissionless case opening (SPEC §Instructions #1 + §Open-time
/// validations).
pub fn handler(
    ctx: Context<OpenCase>,
    parties: Vec<Pubkey>,
    stake: u64,
    join_deadline: i64,
    _nonce: u64,
) -> Result<()> {
    let sub = &ctx.accounts.subaccord;

    // --- SPEC §Open-time validations ----------------------------------------
    // 2..=7 (MAX_OPTIONS = 8 -> 7 party slots + 1 neutral), distinct, opener
    // at index 0.
    require!(
        parties.len() >= MIN_PARTIES && parties.len() <= MAX_PARTIES,
        SynodError::InvalidPartyCount
    );
    for i in 1..parties.len() {
        require!(
            !parties[..i].contains(&parties[i]),
            SynodError::DuplicateParty
        );
    }
    require!(
        ctx.accounts.opener.key() == parties[0],
        SynodError::OpenerNotFirstParty
    );
    // Median scalars have no option mapping (option i == party i).
    require!(
        sub.aggregation == Aggregation::Plurality,
        SynodError::AggregationNotPlurality
    );
    // Fee frozen at open: round-1 panel x per-juror fee (Accord's own
    // derivation — single source with its `FeeMismatch` check).
    let fee = sub.filing_fee()?;
    // The pot must be positive: S is the only economic dial, it absorbs the fee.
    let party_count = parties.len() as u8;
    let pot = (party_count as u64)
        .checked_mul(stake)
        .ok_or(error!(SynodError::ArithmeticOverflow))?;
    require!(pot > fee, SynodError::PotNotPositive);
    require!(
        join_deadline > Clock::get()?.unix_timestamp,
        SynodError::JoinDeadlinePassed
    );

    // --- Init SynodCase ------------------------------------------------------
    let mut roster = [Pubkey::default(); MAX_PARTIES];
    roster[..parties.len()].copy_from_slice(&parties);
    ctx.accounts.case.set_inner(SynodCase {
        subaccord: sub.key(),
        parties: roster,
        party_count,
        joined: 0,
        stake,
        fee,
        join_deadline,
        evidence: [[0u8; 32]; MAX_PARTIES],
        dispute: Pubkey::default(),
        paid_out: 0,
        state: CaseState::Opening,
        bump: ctx.bumps.case,
    });

    Ok(())
}
