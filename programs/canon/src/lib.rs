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
}
