//! `close_item` — SPEC §Instructions #8. Permissionless PDA close.
//!
//! Delist ⇒ delete: once an item is terminal (`Removed` — every terminal path
//! zeroes `accumulated_stake` and the active-challenge bookkeeping first), any
//! caller may close the PDA and pocket the rent. A live submitter self-cranks
//! and recovers the rent they paid at `submit_item`; abandoned /
//! adjudicated-scam items become self-funding GC bounties for whoever cleans
//! them up (the cranker's economics: rent ≫ tx fee).
//!
//! Safe because `Removed` ⇒ settled: closing never strands tokens — the
//! guards re-check the terminal invariants defensively and fail loudly on any
//! breach. Closing frees the `["canon-item", list, account]` seed, so the
//! same curated `account` may be re-submitted later (fresh deposit,
//! `challenge_count` reset — progressive protection restarts by design;
//! durable history lives in `ItemSettled` / `Withdrawn` / `ItemClosed`
//! events, not in a tombstone account). Re-submission is a separate
//! instruction/transaction by construction — never re-init the same PDA in
//! the same tx as the close (Anchor close+init footgun).

use crate::{constants::*, errors::CanonError, events::*, state::*};
use anchor_lang::prelude::*;

/// Account context for `close_item`. Self-seeding: the PDA proves its own
/// lineage (`["canon-item", item.list, item.account]`, canonical bump stored
/// on the account), so no `CanonList` account is needed. `close = caller`
/// drains the rent-exempt lamports to whoever cranks (precedent: Accord
/// `close = caller` on `PendingUpdate`).
#[derive(Accounts)]
pub struct CloseItem<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        close = caller,
        seeds = [SEED_CANON_ITEM, item.list.as_ref(), item.account.as_ref()],
        bump = item.bump,
    )]
    pub item: Account<'info, CanonItem>,
}

/// Permissionless close of a settled item: guards the terminal invariants,
/// emits the tombstone event (before the rent drain, so indexers see an
/// explicit end-of-life instead of an account silently vanishing), and lets
/// Anchor zero the account + refund the caller.
pub fn handler(ctx: Context<CloseItem>) -> Result<()> {
    let item = &ctx.accounts.item;
    require!(item.state == ItemState::Removed, CanonError::NotRemoved);
    // Defensive: every terminal path zeroes these before flipping to
    // `Removed` — a breach here is a state-machine bug, never close past it.
    require!(item.accumulated_stake == 0, CanonError::StakeOutstanding);
    require!(
        item.active_dispute == Pubkey::default(),
        CanonError::NotRemoved
    );

    let list = item.list;
    let item_key = item.key();
    let account = item.account;
    let submitter = item.submitter;
    emit!(ItemClosed {
        list,
        item: item_key,
        account,
        submitter,
    });

    Ok(())
}
