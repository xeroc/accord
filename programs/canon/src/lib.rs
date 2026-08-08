//! # Accord Canon
//!
//! Curated-list / token-registry Arbitrable that files disputes via the Accord.
//! Owns the item lifecycle + item deposits; when an item is challenged it calls
//! `create_dispute(options=[list/remove], …)` and reads `get_ruling` to flip
//! item status. Canon is an Arbitrable, NOT a Subaccord — Accord Core is
//! unchanged.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use errors::CanonError;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU");

#[program]
pub mod canon {
    use super::*;

    /// Permissionless item submission (SPEC §Instructions #2). Verifies
    /// `account.owner == list.list_program` (unless the list is sentinel),
    /// locks the permanent `submit_deposit` (`fee_mint`) into the CanonList
    /// vault, and inits a `CanonItem` PDA in `Pending`.
    pub fn submit_item(ctx: Context<SubmitItem>, evidence: [u8; 32], deposit: u64) -> Result<()> {
        instructions::submit_item::handler(ctx, evidence, deposit)
    }

    /// Permissionless crank (SPEC §Instructions #3): advances a `Pending`
    /// item to `Listed` once the `listing_window` elapses unchallenged.
    pub fn advance_pending(ctx: Context<AdvancePending>) -> Result<()> {
        instructions::advance_pending::handler(ctx)
    }

    /// Permissionless challenge (SPEC §Instructions #4): locks
    /// `challenge_stake + accord_fee` from the challenger, flips the item to
    /// `Disputed`, and CPIs Accord `create_dispute` as the single filer
    /// (ADR-0004). Usable from Pending, Listed, or WithdrawPending.
    pub fn challenge_item<'a>(
        ctx: Context<'a, ChallengeItem<'a>>,
        evidence: [u8; 32],
    ) -> Result<()> {
        instructions::challenge_item::handler(ctx, evidence)
    }

    /// Submitter-only (SPEC §Instructions #6): flips a `Listed` item to
    /// `WithdrawPending` and opens the `withdrawal_timelock` challenge window.
    pub fn request_withdrawal(ctx: Context<RequestWithdrawal>) -> Result<()> {
        instructions::withdrawal::request_withdrawal_handler(ctx)
    }

    /// Permissionless crank (SPEC §Instructions #7): after the
    /// `withdrawal_timelock` elapses unchallenged, returns `accumulated_stake`
    /// to the submitter and flips the item to `Removed`.
    pub fn advance_withdrawal(ctx: Context<AdvanceWithdrawal>) -> Result<()> {
        instructions::withdrawal::advance_withdrawal_handler(ctx)
    }
}
