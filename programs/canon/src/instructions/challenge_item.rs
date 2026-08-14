//! `challenge_item` — SPEC §Instructions #4. Permissionless challenge.
//!
//! Locks `challenge_stake = challenge_pct × accumulated_stake` **+**
//! `accord_fee` (both in `fee_mint`) from the challenger into the CanonList
//! vault, flips the item to `Disputed`, and CPIs Accord `create_dispute` as
//! the single filer (ADR-0004). Canon is the filer — the CanonList PDA signs
//! the CPI — and the dispute PDA is `["dispute", list, nonce]` where `nonce`
//! is the item's `challenge_count` (unique per challenge).
//!
//! Usable from `Pending`, `Listed`, or `WithdrawPending`.
//!
//! The four Accord CPI-only accounts are passed via `remaining_accounts`.
//! The Accord CPI uses the generated `accord::cpi::create_dispute` client —
//! program id + discriminator come from the `accord` crate, not hand-rolled
//! base58/sha256 constants.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `challenge_item`. The four Accord CPI-only accounts
/// (`accord_dispute`, `accord_state`, `accord_fee_vault`,
/// `accord_program`) are in `remaining_accounts`.
#[derive(Accounts)]
pub struct ChallengeItem<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Box<Account<'info, CanonList>>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
        constraint = item.list == list.key(),
    )]
    pub item: Box<Account<'info, CanonItem>>,
    /// Backing Accord Subaccord. Seeds link it to this list (`creator`,
    /// `rules_hash`); `Account<Subaccord>` validates ownership + deserialises.
    /// `mut`: Accord's `create_dispute` writes `fee_vault_deposited` during the
    /// CPI — Anchor's `exit()` is a no-op (owner ≠ canon), so the write survives.
    #[account(
        mut,
        seeds = [accord::SEED_SUBACCORD, list.creator.as_ref(), list.rules_hash.as_ref()],
        seeds::program = accord::ID,
        bump,
    )]
    pub subaccord: Box<Account<'info, accord::state::Subaccord>>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = challenger,
    )]
    pub challenger_token_account: Box<Account<'info, TokenAccount>>,
    /// CanonList-PDA-owned vault. Also the `filer_token_account` in the Accord
    /// CPI (Accord moves `accord_fee` from here into its Subaccord fee_vault).
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts[0..3]:
    //   [0] accord_dispute     (mut — Accord inits)
    //   [1] accord_state      (readonly — Accord validates)
    //   [2] accord_fee_vault   (mut — Accord init_if_needed + transfer)
    //   [3] accord_program     (readonly — address checked in handler)
}

/// Permissionless challenge. Locks stake + fee, flips to Disputed, CPIs Accord.
pub fn handler<'a>(ctx: Context<'a, ChallengeItem<'a>>, evidence: [u8; 32]) -> Result<()> {
    let rem = &ctx.remaining_accounts;
    require!(rem.len() >= 4, CanonError::MissingRemainingAccounts);
    let accord_dispute = &rem[0];
    let accord_state = &rem[1];
    let accord_fee_vault = &rem[2];
    let accord_program = &rem[3];
    require!(
        accord_program.key() == accord::ID,
        CanonError::WrongAccordProgram
    );

    let item = &mut ctx.accounts.item;

    // State gate: revert if already Disputed; must be Pending/Listed/WithdrawPending.
    require!(
        item.state != ItemState::Disputed,
        CanonError::AlreadyDisputed
    );
    require!(
        matches!(
            item.state,
            ItemState::Pending | ItemState::Listed | ItemState::WithdrawPending
        ),
        CanonError::InvalidItemState
    );

    let list = &ctx.accounts.list;

    // challenge_stake = challenge_pct * accumulated_stake / 10_000.
    let challenge_stake = (list.challenge_pct as u64)
        .checked_mul(item.accumulated_stake)
        .ok_or(CanonError::ArithmeticOverflow)?
        / 10_000;

    // `min_jury_size · fee_per_juror` is the fee Accord expects.
    // `Account<Subaccord>` deserialises at entry — no manual borrow/parse.
    let accord_fee = (ctx.accounts.subaccord.min_jury_size as u64)
        .checked_mul(ctx.accounts.subaccord.fee_per_juror)
        .ok_or(CanonError::ArithmeticOverflow)?;

    let total = challenge_stake
        .checked_add(accord_fee)
        .ok_or(CanonError::ArithmeticOverflow)?;

    require!(
        ctx.accounts.challenger_token_account.amount >= total,
        CanonError::InsufficientFunds
    );

    // Lock challenge_stake + accord_fee: challenger ATA -> CanonList vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.challenger_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.challenger.to_account_info(),
            },
        ),
        total,
    )?;

    // Verify the dispute PDA derivation before the CPI.
    let nonce = item.challenge_count as u64;
    let (expected_dispute, _) = Pubkey::find_program_address(
        &[
            accord::SEED_DISPUTE,
            list.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        &accord::ID,
    );
    require!(
        accord_dispute.key() == expected_dispute,
        CanonError::DisputePdaMismatch
    );

    // Record challenge bookkeeping on the item.
    item.state = ItemState::Disputed;
    item.active_dispute = accord_dispute.key();
    item.challenger = ctx.accounts.challenger.key();
    item.challenge_stake = challenge_stake;
    item.challenged_at = Clock::get()?.unix_timestamp;
    item.challenge_count = item
        .challenge_count
        .checked_add(1)
        .ok_or(CanonError::ArithmeticOverflow)?;

    // CPI Accord `create_dispute` via the generated client (Canon = single
    // filer, ADR-0004). The CanonList PDA signs; Accord moves `accord_fee`
    // from the vault (the PDA's ATA) into the Subaccord fee_vault and inits
    // the Dispute PDA. Program id + discriminator come from the `accord` crate.
    let cpi_accounts = accord::cpi::accounts::CreateDispute {
        filer: ctx.accounts.list.to_account_info(),
        subaccord: ctx.accounts.subaccord.to_account_info(),
        pause_state: accord_state.to_account_info(),
        dispute: accord_dispute.to_account_info(),
        fee_token: ctx.accounts.fee_mint.to_account_info(),
        filer_token_account: ctx.accounts.vault.to_account_info(),
        fee_vault: accord_fee_vault.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let signer_bump = list.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_CANON_LIST,
        list.creator.as_ref(),
        list.rules_hash.as_ref(),
        &[signer_bump],
    ]];
    let cpi_ctx = CpiContext::new_with_signer(accord_program.key(), cpi_accounts, signer_seeds);
    accord::cpi::create_dispute(
        cpi_ctx,
        vec![OPTION_KEEP, OPTION_REMOVE],
        evidence,
        nonce,
        accord_fee,
    )?;

    emit!(ItemChallenged {
        list: list.key(),
        item: item.key(),
        challenger: ctx.accounts.challenger.key(),
        dispute: accord_dispute.key(),
        challenge_stake,
        accord_fee,
        evidence,
    });

    Ok(())
}
