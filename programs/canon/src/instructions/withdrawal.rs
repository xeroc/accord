//! `request_withdrawal` + `advance_withdrawal` — SPEC §Instructions #6/#7.
//!
//! `request_withdrawal` (submitter-only, from `Listed`) opens the
//! `withdrawal_timelock` challenge window by flipping the item to
//! `WithdrawPending` and recording the timestamp.
//!
//! `advance_withdrawal` (permissionless crank) completes the withdrawal after
//! the timelock elapses unchallenged: returns `accumulated_stake` to the
//! submitter and flips the item to `Removed`. A `challenge_item` during
//! `WithdrawPending` re-enters the dispute path (settled by `settle_item`);
//! the item is `Removed` either way.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// ─── request_withdrawal ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RequestWithdrawal<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,
    #[account(
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Account<'info, CanonList>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
        constraint = item.list == list.key(),
        constraint = item.submitter == submitter.key() @ CanonError::NotSubmitter,
    )]
    pub item: Account<'info, CanonItem>,
}

pub fn request_withdrawal_handler(ctx: Context<RequestWithdrawal>) -> Result<()> {
    let item = &mut ctx.accounts.item;
    require!(item.state == ItemState::Listed, CanonError::NotListed);

    let now = Clock::get()?.unix_timestamp;
    item.state = ItemState::WithdrawPending;
    item.withdrawal_requested_at = Some(now);

    emit!(WithdrawalRequested {
        list: ctx.accounts.list.key(),
        item: item.key(),
        submitter: ctx.accounts.submitter.key(),
        withdrawal_requested_at: now,
    });

    Ok(())
}

// ─── advance_withdrawal ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AdvanceWithdrawal<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Account<'info, CanonList>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
        constraint = item.list == list.key(),
    )]
    pub item: Account<'info, CanonItem>,
    #[account(address = list.fee_mint)]
    pub fee_mint: Account<'info, Mint>,
    /// Submitter's ATA — receives `accumulated_stake`.
    #[account(
        mut,
        token::mint = fee_mint,
        token::authority = item.submitter,
    )]
    pub submitter_token_account: Account<'info, TokenAccount>,
    /// CanonList vault — source of the return.
    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = list,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn advance_withdrawal_handler(ctx: Context<AdvanceWithdrawal>) -> Result<()> {
    let item = &mut ctx.accounts.item;
    require!(
        item.state == ItemState::WithdrawPending,
        CanonError::NotWithdrawPending
    );

    let now = Clock::get()?.unix_timestamp;
    let requested_at = item
        .withdrawal_requested_at
        .ok_or(CanonError::NotWithdrawPending)?;
    let deadline = requested_at
        .checked_add(ctx.accounts.list.withdrawal_timelock as i64)
        .ok_or(CanonError::ArithmeticOverflow)?;
    require!(now >= deadline, CanonError::WithdrawalTimelockOpen);

    let amount = item.accumulated_stake;

    if amount > 0 {
        let list = &ctx.accounts.list;
        let signer_seeds: &[&[&[u8]]] = &[&[
            SEED_CANON_LIST,
            list.creator.as_ref(),
            list.rules_hash.as_ref(),
            &[list.bump],
        ]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.submitter_token_account.to_account_info(),
                    authority: ctx.accounts.list.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
    }

    item.state = ItemState::Removed;
    item.accumulated_stake = 0;

    emit!(Withdrawn {
        list: ctx.accounts.list.key(),
        item: item.key(),
        submitter: item.submitter,
        amount,
    });

    Ok(())
}
