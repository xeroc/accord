//! `advance_pending` — SPEC §Instructions #3. Permissionless crank.
//!
//! After the `CanonList.listing_window` elapses (measured from
//! `CanonItem.submitted_at`) with no challenge, the item auto-lists:
//! `Pending` -> `Listed`. Reverts if the item is not `Pending` (covers
//! `Disputed` and every other non-Pending state) or the window has not
//! elapsed yet.

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `advance_pending`. Permissionless — any caller may
/// crank. The `list` is read-only (only its `listing_window` is consulted); the
/// `item` is mutated (`state` flip).
#[derive(Accounts)]
pub struct AdvancePending<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [SEED_CANON_LIST, list.creator.as_ref(), list.rules_hash.as_ref()],
        bump = list.bump,
    )]
    pub list: Account<'info, CanonList>,
    #[account(
        mut,
        seeds = [SEED_CANON_ITEM, list.key().as_ref(), item.account.as_ref()],
        bump = item.bump,
    )]
    pub item: Account<'info, CanonItem>,
}

/// Permissionless crank: advances a `Pending` item to `Listed` once the
/// `listing_window` has elapsed.
pub fn handler(ctx: Context<AdvancePending>) -> Result<()> {
    let item = &mut ctx.accounts.item;
    require!(item.state == ItemState::Pending, CanonError::NotPending);

    let now = Clock::get()?.unix_timestamp;
    let deadline = item
        .submitted_at
        .checked_add(ctx.accounts.list.listing_window as i64)
        .ok_or(CanonError::ArithmeticOverflow)?;
    require!(now >= deadline, CanonError::ListingWindowOpen);

    item.state = ItemState::Listed;

    emit!(ItemListed {
        list: ctx.accounts.list.key(),
        item: item.key(),
        account: item.account,
    });

    Ok(())
}
