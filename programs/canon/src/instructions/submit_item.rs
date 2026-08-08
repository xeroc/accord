//! `submit_item` — SPEC §Instructions #2. Permissionless item submission.
//!
//! Verifies the curated `account` is owned by the list's `list_program`
//! (skipped when `list_program` is the sentinel `Pubkey::default()`), locks the
//! permanent `submit_deposit` (`fee_mint`) from the submitter into the CanonList
//! vault, and inits a `CanonItem` PDA keyed by `["canon-item", list, account]`
//! in `Pending` with `accumulated_stake = submit_deposit`.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Account context for `submit_item`.
#[derive(Accounts)]
pub struct SubmitItem<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Account<'info, CanonList>,
    #[account(
        init,
        payer = submitter,
        space = 8 + CanonItem::INIT_SPACE,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), account.key().as_ref()],
        bump,
    )]
    pub item: Account<'info, CanonItem>,
    /// The curated account. Ownership verified in-handler against
    /// `list.list_program`; when `list_program == Pubkey::default()` the check
    /// is disabled and this may be arbitrary base58 data (Q15/Q16).
    /// CHECK: ownership verified manually in the handler.
    pub account: UncheckedAccount<'info>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = submitter,
    )]
    pub submitter_token_account: Account<'info, TokenAccount>,
    /// CanonList-PDA-owned vault for `fee_mint` deposits. Lazily created on
    /// first submit.
    #[account(
        init_if_needed,
        payer = submitter,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Permissionless item submission. Locks the permanent deposit and inits the
/// `CanonItem` in `Pending`.
pub fn handler(ctx: Context<SubmitItem>, evidence: [u8; 32], deposit: u64) -> Result<()> {
    let list = &mut ctx.accounts.list;

    // Defense-in-depth: the caller's deposit must match the list's canonical
    // submit_deposit (mirrors Accord's `FeeMismatch` gate).
    require!(deposit == list.submit_deposit, CanonError::DepositMismatch);

    // Ownership gate: when list_program is set, the curated account must be
    // owned by it. The sentinel (Pubkey::default()) disables the check so a
    // list can curate arbitrary base58 data (Q15/Q16).
    if list.list_program != Pubkey::default() {
        require!(
            ctx.accounts.account.owner == &list.list_program,
            CanonError::OwnerMismatch
        );
    }

    // Lock the permanent deposit: submitter ATA -> CanonList vault.
    let before = ctx.accounts.vault.amount;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.submitter_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.submitter.to_account_info(),
            },
        ),
        deposit,
    )?;
    // Fee-on-transfer safe: credit the real delta the vault received.
    ctx.accounts.vault.reload()?;
    let after = ctx.accounts.vault.amount;
    let delta = after
        .checked_sub(before)
        .ok_or(CanonError::ArithmeticOverflow)?;

    let submitter_key = ctx.accounts.submitter.key();
    let account_key = ctx.accounts.account.key();
    let item = &mut ctx.accounts.item;
    item.account = account_key;
    item.list = list.key();
    item.submitter = submitter_key;
    item.state = ItemState::Pending;
    item.accumulated_stake = delta;
    item.submitted_at = Clock::get()?.unix_timestamp;
    item.bump = ctx.bumps.item;

    list.item_count = list
        .item_count
        .checked_add(1)
        .ok_or(CanonError::ArithmeticOverflow)?;

    emit!(ItemSubmitted {
        list: list.key(),
        item: item.key(),
        account: account_key,
        submitter: submitter_key,
        deposit: delta,
        evidence,
    });

    Ok(())
}
