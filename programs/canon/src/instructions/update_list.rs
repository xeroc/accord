//! `update_list` handler — see `UpdateList` accounts struct in `lib.rs`.
//!
//! Authority-gated instant retune of the list-level economics (SPEC
//! §Instructions #9). Deliberately NOT timelocked: deposits lock per-item at
//! `submit_item` (existing items keep their locked skin), `challenge_pct`
//! applies at the next `challenge_item`, and the windows only gate future
//! crank advances — no in-flight value can be retroactively stolen. Court
//! (dispute-mechanism) params keep the 48h Accord timelock via
//! `propose_court_update`.

use crate::constants::*;
use crate::errors::CanonError;
use crate::events::*;
use crate::UpdateList;
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<UpdateList>,
    submit_deposit: u64,
    challenge_pct: u16,
    listing_window: u64,
    withdrawal_timelock: u64,
    new_authority: Pubkey,
) -> Result<()> {
    let list = &mut ctx.accounts.list;
    require!(
        ctx.accounts.authority.key() == list.authority,
        CanonError::Unauthorized
    );
    require!(submit_deposit > 0, CanonError::ZeroDeposit);
    require!(
        challenge_pct <= MAX_CHALLENGE_PCT_BPS,
        CanonError::ChallengePctTooHigh
    );
    require!(listing_window > 0, CanonError::WindowTooShort);
    require!(withdrawal_timelock > 0, CanonError::WindowTooShort);

    list.submit_deposit = submit_deposit;
    list.challenge_pct = challenge_pct;
    list.listing_window = listing_window;
    list.withdrawal_timelock = withdrawal_timelock;
    // `Pubkey::default()` is the "no rotation" sentinel (same convention as
    // the Subaccord attestation pair) — and rotating TO default would strand
    // the list, so the sentinel doubles as the guard.
    if new_authority != Pubkey::default() {
        list.authority = new_authority;
    }

    emit!(ListUpdated {
        list: list.key(),
        submit_deposit,
        challenge_pct,
        listing_window,
        withdrawal_timelock,
        authority: list.authority,
    });

    Ok(())
}
